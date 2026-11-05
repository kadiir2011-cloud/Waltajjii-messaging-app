(() => {
  const dictionaries = {
    en: {
      "app-subtitle": "Connect through conversation",
      "language-label": "Language",
      "auth-title": "Welcome to Waltajjii",
      "auth-description": "Log in to send and receive messages.",
      "username-label": "Username",
      "password-label": "Password",
      "login-button": "Log in",
      "register-toggle": "Create account",
      "register-title": "Create a Waltajjii account",
      "new-username-label": "Choose a username",
      "new-password-label": "Choose a password (at least 12 characters)",
      "register-button": "Register",
      "back-login-button": "Back to login",
      "messages-title": "Messages",
      "logout-button": "Log out",
      "recipient-label": "Choose a recipient",
      "load-button": "Load conversation",
      "call-title": "Video call",
      "start-call-button": "Start video call",
      "accept-call-button": "Accept",
      "reject-call-button": "Reject",
      "end-call-button": "End call",
      "message-placeholder": "Write a message...",
      "send-button": "Send",
      "footer-text": "WALTAJJII™ · © 2026 · Created by Kedir Negesso Tukeni"
    },
    om: {
      "app-subtitle": "Waliin haasa'uun wal qunnamaa",
      "language-label": "Afaan",
      "auth-title": "Baga gara Waltajjii dhuftan",
      "auth-description": "Ergaa erguu fi fudhachuuf seenaa.",
      "username-label": "Maqaa fayyadamaa",
      "password-label": "Jecha iccitii",
      "login-button": "Seeni",
      "register-toggle": "Herrega uumi",
      "register-title": "Herrega Waltajjii uumi",
      "new-username-label": "Maqaa fayyadamaa filadhu",
      "new-password-label": "Jecha iccitii filadhu (yoo xiqqaate qubee 12)",
      "register-button": "Galmaa'i",
      "back-login-button": "Gara seensaatti deebi'i",
      "messages-title": "Ergaawwan",
      "logout-button": "Ba'i",
      "recipient-label": "Nama ergaa fudhatu filadhu",
      "load-button": "Haasa'a bani",
      "call-title": "Bilbila viidiyoo",
      "start-call-button": "Bilbila viidiyoo jalqabi",
      "accept-call-button": "Fudhadhu",
      "reject-call-button": "Didi",
      "end-call-button": "Bilbila cufi",
      "message-placeholder": "Ergaa barreessi...",
      "send-button": "Ergi",
      "footer-text": "Waltajjii · Guddina jalqabaa"
    },
    am: {
      "app-subtitle": "በውይይት ይገናኙ",
      "language-label": "ቋንቋ",
      "auth-title": "ወደ ዋልታጂ እንኳን በደህና መጡ",
      "auth-description": "መልዕክቶችን ለመላክና ለመቀበል ይግቡ።",
      "username-label": "የተጠቃሚ ስም",
      "password-label": "የይለፍ ቃል",
      "login-button": "ግባ",
      "register-toggle": "መለያ ፍጠር",
      "register-title": "የዋልታጂ መለያ ፍጠር",
      "new-username-label": "የተጠቃሚ ስም ምረጥ",
      "new-password-label": "የይለፍ ቃል ምረጥ (ቢያንስ 12 ቁምፊዎች)",
      "register-button": "ተመዝገብ",
      "back-login-button": "ወደ መግቢያ ተመለስ",
      "messages-title": "መልዕክቶች",
      "logout-button": "ውጣ",
      "recipient-label": "ተቀባይ ምረጥ",
      "load-button": "ውይይት ክፈት",
      "call-title": "የቪዲዮ ጥሪ",
      "start-call-button": "የቪዲዮ ጥሪ ጀምር",
      "accept-call-button": "ተቀበል",
      "reject-call-button": "እምቢ በል",
      "end-call-button": "ጥሪውን ጨርስ",
      "message-placeholder": "መልዕክት ይጻፉ...",
      "send-button": "ላክ",
      "footer-text": "ዋልታጂ · የመጀመሪያ የእድገት ስሪት"
    },
    ar: {
      "app-subtitle": "تواصلوا من خلال المحادثة",
      "language-label": "اللغة",
      "auth-title": "مرحبًا بكم في والتاجي",
      "auth-description": "سجّل الدخول لإرسال الرسائل واستقبالها.",
      "username-label": "اسم المستخدم",
      "password-label": "كلمة المرور",
      "login-button": "تسجيل الدخول",
      "register-toggle": "إنشاء حساب",
      "register-title": "إنشاء حساب والتاجي",
      "new-username-label": "اختر اسم مستخدم",
      "new-password-label": "اختر كلمة مرور (12 حرفًا على الأقل)",
      "register-button": "تسجيل",
      "back-login-button": "العودة إلى تسجيل الدخول",
      "messages-title": "الرسائل",
      "logout-button": "تسجيل الخروج",
      "recipient-label": "اختر المستلم",
      "load-button": "تحميل المحادثة",
      "call-title": "مكالمة فيديو",
      "start-call-button": "بدء مكالمة فيديو",
      "accept-call-button": "قبول",
      "reject-call-button": "رفض",
      "end-call-button": "إنهاء المكالمة",
      "message-placeholder": "اكتب رسالة...",
      "send-button": "إرسال",
      "footer-text": "والتاجي · نسخة تطوير أولية"
    },
    so: {
      "app-subtitle": "Ku xidhnow wada sheekaysi",
      "language-label": "Luqadda",
      "auth-title": "Ku soo dhowow Waltajjii",
      "auth-description": "Gal si aad farriimo u dirto una hesho.",
      "username-label": "Magaca isticmaalaha",
      "password-label": "Furaha sirta ah",
      "login-button": "Gal",
      "register-toggle": "Samee akoon",
      "register-title": "Samee akoon Waltajjii",
      "new-username-label": "Dooro magac isticmaale",
      "new-password-label": "Dooro furaha sirta ah (ugu yaraan 12 xaraf)",
      "register-button": "Diiwaangeli",
      "back-login-button": "Ku noqo gelitaanka",
      "messages-title": "Farriimaha",
      "logout-button": "Ka bax",
      "recipient-label": "Dooro qofka qaata",
      "load-button": "Fur wada sheekaysiga",
      "call-title": "Wicitaan muuqaal ah",
      "start-call-button": "Bilow wicitaan muuqaal ah",
      "accept-call-button": "Aqbal",
      "reject-call-button": "Diid",
      "end-call-button": "Dhammee wicitaanka",
      "message-placeholder": "Qor farriin...",
      "send-button": "Dir",
      "footer-text": "Waltajjii · Nooca horumarinta bilowga ah"
    },
    fr: {
      "app-subtitle": "Connectez-vous par la conversation",
      "language-label": "Langue",
      "auth-title": "Bienvenue sur Waltajjii",
      "auth-description": "Connectez-vous pour envoyer et recevoir des messages.",
      "username-label": "Nom d'utilisateur",
      "password-label": "Mot de passe",
      "login-button": "Se connecter",
      "register-toggle": "Créer un compte",
      "register-title": "Créer un compte Waltajjii",
      "new-username-label": "Choisissez un nom d'utilisateur",
      "new-password-label": "Choisissez un mot de passe (12 caractères minimum)",
      "register-button": "S'inscrire",
      "back-login-button": "Retour à la connexion",
      "messages-title": "Messages",
      "logout-button": "Se déconnecter",
      "recipient-label": "Choisir un destinataire",
      "load-button": "Charger la conversation",
      "call-title": "Appel vidéo",
      "start-call-button": "Démarrer l'appel vidéo",
      "accept-call-button": "Accepter",
      "reject-call-button": "Refuser",
      "end-call-button": "Terminer l'appel",
      "message-placeholder": "Écrivez un message...",
      "send-button": "Envoyer",
      "footer-text": "Waltajjii · Version de développement initiale"
    },
    zh: {
      "app-subtitle": "通过交流建立联系",
      "language-label": "语言",
      "auth-title": "欢迎使用 Waltajjii",
      "auth-description": "登录以发送和接收消息。",
      "username-label": "用户名",
      "password-label": "密码",
      "login-button": "登录",
      "register-toggle": "创建账户",
      "register-title": "创建 Waltajjii 账户",
      "new-username-label": "选择用户名",
      "new-password-label": "选择密码（至少 12 个字符）",
      "register-button": "注册",
      "back-login-button": "返回登录",
      "messages-title": "消息",
      "logout-button": "退出登录",
      "recipient-label": "选择接收者",
      "load-button": "加载对话",
      "call-title": "视频通话",
      "start-call-button": "开始视频通话",
      "accept-call-button": "接听",
      "reject-call-button": "拒绝",
      "end-call-button": "结束通话",
      "message-placeholder": "输入消息...",
      "send-button": "发送",
      "footer-text": "Waltajjii · 早期开发版本"
    }
  };

  const targets = {
    "app-subtitle": "#app-subtitle",
    "language-label": "#language-label",
    "auth-title": "#auth-panel h2",
    "auth-description": "#auth-panel > p.muted",
    "username-label": 'label[for="username"]',
    "password-label": 'label[for="password"]',
    "login-button": '#login-form button[type="submit"]',
    "register-toggle": "#show-register",
    "register-title": "#register-form h3",
    "new-username-label": 'label[for="new-username"]',
    "new-password-label": 'label[for="new-password"]',
    "register-button": '#register-form button[type="submit"]',
    "back-login-button": "#show-login",
    "messages-title": "#chat-panel h2",
    "logout-button": "#logout-button",
    "recipient-label": 'label[for="recipient"]',
    "load-button": "#load-button",
    "call-title": "#call-panel h3",
    "start-call-button": "#start-call-button",
    "accept-call-button": "#accept-call-button",
    "reject-call-button": "#reject-call-button",
    "end-call-button": "#end-call-button",
    "message-placeholder": "#message-input",
    "send-button": '#message-form button[type="submit"]',
    "footer-text": "footer"
  };

  function applyLanguage(language) {
    const selected = dictionaries[language] ? language : "en";
    const rtl = selected === "ar";

    document.documentElement.lang = selected;
    document.documentElement.dir = rtl ? "rtl" : "ltr";

    for (const [key, selector] of Object.entries(targets)) {
      const element = document.querySelector(selector);
      if (!element) continue;
      const value = dictionaries[selected][key];
      if (value === undefined) continue;

      if (key === "message-placeholder") {
        element.placeholder = value;
      } else {
        element.textContent = value;
      }
    }

    try {
      localStorage.setItem("waltajjii-language", selected);
    } catch (_) {}
  }


  // Extended interface vocabulary. User-authored messages, posts, names and biographies
  // are deliberately excluded from automatic translation.
  const phrases = {
    "Your profile": ["Your profile","Pirofayila kee","መገለጫዎ","ملفك الشخصي","Boggaaga","Votre profil","你的个人资料"],
    "Basic identity": ["Basic identity","Eenummaa bu'uuraa","መሠረታዊ መለያ","المعلومات الأساسية","Aqoonsiga aasaasiga ah","Identité de base","基本身份信息"],
    "Professional information": ["Professional information","Odeeffannoo ogummaa","የሙያ መረጃ","المعلومات المهنية","Macluumaadka xirfadeed","Informations professionnelles","职业信息"],
    "Profile picture": ["Profile picture","Suuraa pirofayila","የመገለጫ ፎቶ","الصورة الشخصية","Sawirka astaanta","Photo de profil","头像"],
    "Save profile": ["Save profile","Pirofayila olkaa'i","መገለጫውን አስቀምጥ","حفظ الملف الشخصي","Kaydi bogga","Enregistrer le profil","保存个人资料"],
    "Upload picture": ["Upload picture","Suuraa olkaa'i","ፎቶ ጫን","رفع الصورة","Soo geli sawir","Téléverser une photo","上传图片"],
    "Remove picture": ["Remove picture","Suuraa haqi","ፎቶውን አስወግድ","إزالة الصورة","Ka saar sawirka","Supprimer la photo","删除图片"],
    "Waltajjii Social": ["Waltajjii Social","Waltajjii Hawaasummaa","ዋልታጂ ማህበራዊ","والتاجي الاجتماعي","Waltajjii Bulsho","Waltajjii Social","Waltajjii 社交"],
    "Discover": ["Discover","Barbaadi","ፈልግ","استكشف","Soo hel","Découvrir","发现"],
    "Feed": ["Feed","Soorata","የዜና ማሰራጫ","آخر المستجدات","Qulqulka","Fil","动态"],
    "Requests": ["Requests","Gaaffiiwwan","ጥያቄዎች","الطلبات","Codsiyada","Demandes","请求"],
    "Following": ["Following","Kan hordoftu","የምትከታተላቸው","المتابَعون","Kuwaad raacdo","Abonnements","正在关注"],
    "Followers": ["Followers","Hordoftoota","ተከታዮች","المتابعون","Kuwa ku raaca","Abonnés","粉丝"],
    "Notifications": ["Notifications","Beeksisa","ማሳወቂያዎች","الإشعارات","Ogeysiisyada","Notifications","通知"],
    "Search": ["Search","Barbaadi","ፈልግ","بحث","Raadi","Rechercher","搜索"],
    "Publish post": ["Publish post","Maxxansi baasii","ጽሑፍ አትም","نشر المنشور","Daabac qoraal","Publier","发布帖子"],
    "Connection requests": ["Connection requests","Gaaffii walquunnamtii","የግንኙነት ጥያቄዎች","طلبات الاتصال","Codsiyada xiriirka","Demandes de connexion","好友请求"],
    "People you follow": ["People you follow","Namoota hordoftu","የምትከታተላቸው ሰዎች","الأشخاص الذين تتابعهم","Dadka aad raacdo","Personnes suivies","你关注的人"],
    "Your followers": ["Your followers","Hordoftoota kee","ተከታዮችህ","متابعوك","Kuwa ku raaca","Vos abonnés","你的粉丝"],
    "Mark all as read": ["Mark all as read","Hundaa akka dubbifame mallatteessi","ሁሉንም እንደተነበበ ምልክት አድርግ","تحديد الكل كمقروء","Dhammaan u calaamadee la akhriyay","Tout marquer comme lu","全部标记为已读"],
    "Choose a recipient": ["Choose a recipient","Nama ergaa fudhatu filadhu","ተቀባይ ምረጥ","اختر المستلم","Dooro qaataha","Choisir un destinataire","选择接收者"],
    "Load conversation": ["Load conversation","Haasa'a fe'i","ውይይት ጫን","تحميل المحادثة","Soo rar wada sheekaysiga","Charger la conversation","加载对话"],
    "Video call": ["Video call","Bilbila viidiyoo","የቪዲዮ ጥሪ","مكالمة فيديو","Wicitaan muuqaal ah","Appel vidéo","视频通话"],
    "Start video call": ["Start video call","Bilbila viidiyoo jalqabi","የቪዲዮ ጥሪ ጀምር","بدء مكالمة فيديو","Bilow wicitaan muuqaal ah","Démarrer l'appel vidéo","开始视频通话"],
    "Voice call": ["Voice call","Bilbila sagalee","የድምፅ ጥሪ","مكالمة صوتية","Wicitaan cod ah","Appel vocal","语音通话"],
    "Groups": ["Groups","Gareewwan","ቡድኖች","المجموعات","Kooxo","Groupes","群组"],
    "Create group": ["Create group","Garee uumi","ቡድን ፍጠር","إنشاء مجموعة","Samee koox","Créer un groupe","创建群组"],
    "Refresh groups": ["Refresh groups","Gareewwan haaromsi","ቡድኖችን አድስ","تحديث المجموعات","Cusboonaysii kooxaha","Actualiser les groupes","刷新群组"],
    "Channels": ["Channels","Chaanaalii","ቻናሎች","القنوات","Kanaallada","Chaînes","频道"],
    "Create channel": ["Create channel","Chaanaalii uumi","ቻናል ፍጠር","إنشاء قناة","Samee kanaal","Créer une chaîne","创建频道"],
    "Refresh channels": ["Refresh channels","Chaanaalii haaromsi","ቻናሎችን አድስ","تحديث القنوات","Cusboonaysii kanaallada","Actualiser les chaînes","刷新频道"],
    "Send": ["Send","Ergi","ላክ","إرسال","Dir","Envoyer","发送"],
    "Log out": ["Log out","Ba'i","ውጣ","تسجيل الخروج","Ka bax","Se déconnecter","退出登录"]
  };

  const phraseObserver = new MutationObserver(() => translatePhrases());
  function translatePhrases() {
    const selector = document.getElementById("language-select");
    const language = selector && dictionaries[selector.value] ? selector.value : "en";
    const index = ["en","om","am","ar","so","fr","zh"].indexOf(language);
    if (index < 0) return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const parent = node.parentElement;
      if (!parent || parent.closest("script,style,textarea,input,option,.message,.social-post,.social-comment,#profile-bio-display,[contenteditable='true']")) continue;
      const original = node.__waltajjiiOriginal || node.nodeValue.trim();
      const translated = phrases[original]?.[index];
      if (!translated) continue;
      if (!node.__waltajjiiOriginal) node.__waltajjiiOriginal = original;
      if (node.nodeValue.trim() === original) node.nodeValue = node.nodeValue.replace(original, translated);
      else if (node.nodeValue.trim() === phrases[original]?.[0]) node.nodeValue = node.nodeValue.replace(phrases[original][0], translated);
    }
  }

  function initialize() {
    const selector = document.getElementById("language-select");
    if (!selector) return;

    let saved = "en";
    try {
      saved = localStorage.getItem("waltajjii-language") || "en";
    } catch (_) {}

    if (!dictionaries[saved]) saved = "en";
    selector.value = saved;
    applyLanguage(saved);
    selector.addEventListener("change", () => {
      applyLanguage(selector.value);
      translatePhrases();
      if (window.waltajjiiDynamicTranslate) window.waltajjiiDynamicTranslate();
    });
    translatePhrases();
    phraseObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
