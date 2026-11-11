"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),Database=require("better-sqlite3"),{Pool}=require("pg");
const quote=value=>'"'+String(value).replace(/"/g,'""')+'"';
const qualify=(schema,table)=>quote(schema)+"."+quote(table);
function normalize(value,column){
 if(value===null||value===undefined)return null;
 if(column.data_type==="bigint")return String(value);
 if(column.data_type==="timestamp with time zone"||column.data_type==="timestamp without time zone"){
  if(value instanceof Date)return value.toISOString();
  const raw=String(value);
  const hasZone=/([zZ]|[+-]\d\d(?::?\d\d)?)$/.test(raw);
  const parsed=new Date(hasZone?raw:raw.replace(" ","T")+"Z");
  if(!Number.isFinite(parsed.getTime()))throw new Error("Invalid timestamp found during parity verification.");
  return parsed.toISOString();
 }
 if(column.data_type==="boolean")return value===true||value===1||value==="1"||value==="t";
 if(["smallint","integer"].includes(column.data_type))return Number(value);
 if(["numeric","real","double precision"].includes(column.data_type))return Number(value);
 if(Buffer.isBuffer(value))return value.toString("base64");
 return String(value);
}
function digestRows(rows,columns){
 const hash=crypto.createHash("sha256");
 for(const row of rows){const values=columns.map(c=>normalize(row[c.column_name],c));hash.update(JSON.stringify(values));hash.update("\n");}
 return hash.digest("hex");
}
function topologicalOrder(tables,constraints){
 const set=new Set(tables),deps=new Map(tables.map(t=>[t,new Set()]));
 for(const fk of constraints){if(!set.has(fk.table)||!set.has(fk.referenced_table)||fk.table===fk.referenced_table||fk.has_nullable_column)continue;deps.get(fk.table).add(fk.referenced_table);}
 const result=[],pending=new Set(tables);
 while(pending.size){let progressed=false;for(const t of [...pending]){if([...deps.get(t)].every(d=>!pending.has(d))){result.push(t);pending.delete(t);progressed=true;}}if(!progressed)throw new Error("Non-nullable foreign-key cycle detected; migration must be reviewed before import.");}
 return result;
}
async function runMigrationRehearsal({sqlitePath,pool,allowDisposableTarget=false,schema="waltajjii"}){
 if(!allowDisposableTarget)throw new Error("Safety gate: set WALTAJJII_ALLOW_DISPOSABLE_TARGET=1 only for an isolated rehearsal database.");
 if(!sqlitePath||!fs.existsSync(sqlitePath))throw new Error("A readable SQLite source database path is required.");
 if(!pool||typeof pool.query!=="function")throw new Error("A PostgreSQL pool is required.");
 if(!/^[a-z_][a-z0-9_]*$/.test(schema))throw new Error("Invalid PostgreSQL schema name.");
 const source=new Database(path.resolve(sqlitePath),{readonly:true,fileMustExist:true,timeout:5000});
 const client=await pool.connect();
 let transactionStarted=false;
 try{
  const identity=await client.query("SELECT current_database() AS database_name, inet_server_addr()::text AS server_address");
  const databaseName=identity.rows[0].database_name;
  if(!/(test|rehearsal|disposable)/i.test(databaseName))throw new Error("Safety gate: target database name must clearly identify a test, rehearsal or disposable database.");
  const targetTables=(await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_type='BASE TABLE' ORDER BY table_name",[schema])).rows.map(r=>r.table_name);
  if(!targetTables.length)throw new Error("Target schema is missing or has no base tables; apply reviewed migrations to a disposable database first.");
  const sourceTables=source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
  const missing=sourceTables.filter(t=>!targetTables.includes(t));
  if(missing.length)throw new Error("Target schema is missing source tables: "+missing.join(", "));
  const targetColumns={};
  for(const table of targetTables){
   targetColumns[table]=(await client.query("SELECT column_name,data_type,is_nullable,column_default,identity_generation,ordinal_position FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position",[schema,table])).rows;
   const count=Number((await client.query("SELECT COUNT(*)::bigint AS count FROM "+qualify(schema,table))).rows[0].count);
   if(count!==0)throw new Error("Target table is not empty; refusing to overwrite or mix data: "+table);
  }
  const constraints=(await client.query("SELECT tc.table_name,tc.constraint_name,ccu.table_name AS referenced_table,kcu.column_name,cols.is_nullable FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.constraint_schema=kcu.constraint_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.constraint_schema=tc.constraint_schema JOIN information_schema.columns cols ON cols.table_schema=kcu.constraint_schema AND cols.table_name=kcu.table_name AND cols.column_name=kcu.column_name WHERE tc.constraint_type='FOREIGN KEY' AND tc.constraint_schema=$1 ORDER BY tc.table_name,kcu.ordinal_position",[schema])).rows;
  const grouped=new Map();
  for(const row of constraints){const key=row.table_name+"|"+row.constraint_name;if(!grouped.has(key))grouped.set(key,{table:row.table_name,referenced_table:row.referenced_table,has_nullable_column:false,columns:[]});const g=grouped.get(key);g.columns.push(row.column_name);if(row.is_nullable==="YES")g.has_nullable_column=true;}
  const foreignKeys=[...grouped.values()],order=topologicalOrder(sourceTables,foreignKeys);
  const sourceMeta={},primaryKeys={},sourceCounts={};
  for(const table of sourceTables){
   const meta=source.pragma("table_info("+quote(table)+")").map(c=>({name:c.name,notnull:!!c.notnull,pk:Number(c.pk)}));
   sourceMeta[table]=meta;primaryKeys[table]=meta.filter(c=>c.pk>0).sort((a,b)=>a.pk-b.pk).map(c=>c.name);
   if(!primaryKeys[table].length)throw new Error("Source table has no primary key; safe row-level parity cannot be guaranteed: "+table);
   const sourceNames=new Set(meta.map(c=>c.name)),dest=targetColumns[table],destNames=new Set(dest.map(c=>c.column_name));
   const extras=meta.filter(c=>!destNames.has(c.name)).map(c=>c.name);
   if(extras.length)throw new Error("Unmapped source columns in "+table+": "+extras.join(", "));
   for(const col of dest){
    if(!sourceNames.has(col.column_name)&&col.is_nullable==="NO"&&!col.column_default&&!col.identity_generation)throw new Error("Required PostgreSQL column has no SQLite source or default: "+table+"."+col.column_name);
   }
   sourceCounts[table]=Number(source.prepare("SELECT COUNT(*) AS count FROM "+quote(table)).get().count);
  }
  const nullableForeignKeys=foreignKeys.filter(f=>f.has_nullable_column&&sourceTables.includes(f.table));
  await client.query("BEGIN");transactionStarted=true;
  const tableReports=[];
  for(const table of order){
   const dest=targetColumns[table],srcNames=new Set(sourceMeta[table].map(c=>c.name));
   const columns=dest.filter(c=>srcNames.has(c.column_name));
   const stagedColumns=new Set(nullableForeignKeys.filter(f=>f.table===table).flatMap(f=>f.columns.filter(name=>columns.some(c=>c.column_name===name&&c.is_nullable==="YES"))));
   const insertColumns=columns.map(c=>c.column_name);
   const insertable=columns.filter(c=>!stagedColumns.has(c.column_name));
   const batchSize=Math.max(1,Math.min(500,Math.floor(60000/Math.max(1,insertable.length))));
   let batch=[];
   const flush=async()=>{
    if(!batch.length)return;
    const params=[],tuples=batch.map(row=>"("+insertable.map(c=>{params.push(normalize(row[c.column_name],c));return "$"+params.length;}).join(",")+")");
    await client.query("INSERT INTO "+qualify(schema,table)+" ("+insertable.map(c=>quote(c.column_name)).join(",")+") VALUES "+tuples.join(","),params);
    batch=[];
   };
   const select=source.prepare("SELECT * FROM "+quote(table));
   for(const row of select.iterate()){
    const copy={...row};for(const col of stagedColumns)copy[col]=null;batch.push(copy);if(batch.length>=batchSize)await flush();
   }
   await flush();
   tableReports.push({table,sourceRows:sourceCounts[table],importedRows:sourceCounts[table],stagedNullableReferences:[...stagedColumns]});
  }
  for(const fk of nullableForeignKeys){
   const table=fk.table,pk=primaryKeys[table],columns=fk.columns.filter(name=>targetColumns[table].some(c=>c.column_name===name&&c.is_nullable==="YES"));
   if(!columns.length)continue;
   const pkSelect=pk.map(quote).join(",");
   for(const column of columns){
    const batch=[];const flush=async()=>{
     if(!batch.length)return;
     const params=[],rows=batch.map(item=>"("+[item.value,...item.keys].map(v=>{params.push(v);return "$"+params.length;}).join(",")+")");
     const aliases=["value",...pk].map(quote).join(",");
     const where=pk.map((k,i)=>"t."+quote(k)+"=v."+quote(k)).join(" AND ");
     await client.query("UPDATE "+qualify(schema,table)+" AS t SET "+quote(column)+"=v."+quote("value")+" FROM (VALUES "+rows.join(",")+") AS v("+aliases+") WHERE "+where,params);
     batch.length=0;
    };
    for(const row of source.prepare("SELECT "+[column,...pk].map(quote).join(",")+" FROM "+quote(table)+" WHERE "+quote(column)+" IS NOT NULL").iterate()){
     batch.push({value:normalize(row[column],targetColumns[table].find(c=>c.column_name===column)),keys:pk.map(k=>row[k])});
     if(batch.length>=200)await flush();
    }
    await flush();
   }
  }
  for(const table of sourceTables){
   const pks=primaryKeys[table],columns=targetColumns[table].filter(c=>sourceMeta[table].some(s=>s.name===c.column_name));
   const sourceRows=source.prepare("SELECT * FROM "+quote(table)+" ORDER BY "+pks.map(quote).join(",")).all();
   const destRows=(await client.query("SELECT "+columns.map(c=>quote(c.column_name)).join(",")+" FROM "+qualify(schema,table)+" ORDER BY "+pks.map(quote).join(",")).then(r=>r.rows));
   if(sourceRows.length!==destRows.length)throw new Error("Row-count mismatch in "+table+": source "+sourceRows.length+", target "+destRows.length);
   const sourceDigest=digestRows(sourceRows,columns),targetDigest=digestRows(destRows,columns);
   if(sourceDigest!==targetDigest)throw new Error("Row-level checksum mismatch in "+table+".");
   const identityCol=columns.find(c=>c.identity_generation&&pks.includes(c.column_name));
   if(identityCol)await client.query("SELECT setval(pg_get_serial_sequence($1,$2),COALESCE(MAX("+quote(identityCol.column_name)+"),1),COUNT(*)>0) FROM "+qualify(schema,table),[schema+"."+table,identityCol.column_name]);
   tableReports.find(r=>r.table===table).sha256=sourceDigest;
  }
  await client.query("COMMIT");transactionStarted=false;
  return {phase:58,status:"passed",sourceDatabase:path.basename(path.resolve(sqlitePath)),targetDatabase:databaseName,targetSchema:schema,readOnlySource:true,transactionalImport:true,tableCount:tableReports.length,totalRows:tableReports.reduce((s,r)=>s+r.sourceRows,0),tables:tableReports,mediaObjectsImported:0,notes:["Only rows from matching SQLite application tables were imported; PostgreSQL-only media_objects metadata remains empty and requires a separate object-reconciliation process.","SQLite naive timestamps were interpreted as UTC for PostgreSQL TIMESTAMPTZ columns.","The source SQLite database was opened read-only.","This disposable rehearsal is not a production cutover or proof that remote Supabase Storage objects exist."]};
 }catch(error){if(transactionStarted)await client.query("ROLLBACK");throw error;}
 finally{source.close();client.release();}
}
async function main(){
 const sqlitePath=process.argv[2]||process.env.WALTAJJII_SQLITE_PATH;
 const connectionString=process.env.WALTAJJII_REHEARSAL_DATABASE_URL;
 if(!connectionString)throw new Error("Set WALTAJJII_REHEARSAL_DATABASE_URL to a disposable PostgreSQL database.");
 const pool=new Pool({connectionString,max:2,ssl:process.env.PGSSL==="true"?{rejectUnauthorized:true}:undefined});
 try{
  const report=await runMigrationRehearsal({sqlitePath,pool,allowDisposableTarget:process.env.WALTAJJII_ALLOW_DISPOSABLE_TARGET==="1"});
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
 }finally{await pool.end();}
}
if(require.main===module)main().catch(error=>{process.stderr.write("Phase 58 rehearsal failed: "+error.message+"\n");process.exitCode=1;});
module.exports={runMigrationRehearsal,normalize,topologicalOrder};
