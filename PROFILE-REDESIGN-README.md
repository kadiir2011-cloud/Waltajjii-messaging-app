# Waltajjii profile redesign (review build)

This package contains a profile redesign based on the source ZIP supplied for Waltajjii.

## Changes
- Refreshed the profile section with a responsive, professional visual design.
- Added optional professional title, organization, department, location, and website fields.
- Added a profile-sharing preference: personal, professional, or both.
- Extended the authenticated profile API and recipient list fields.
- Added safe SQLite startup migrations for the new profile columns. Existing users, messages, and groups are not intentionally deleted.
- Preserved the existing login, messaging, group, calls, and picture-upload flows.

## Before deploying
1. Keep a backup of the current GitHub repository and the persistent SQLite database.
2. Review the changed files before merging/deploying.
3. Deploy to a test branch/service first if possible.
4. Test login, profile save/reload, avatar upload/removal, recipient list, one-to-one messaging, groups, and calls.
5. Do not commit `.env`, JWT secrets, Supabase keys, or other credentials.

The profile-sharing preference controls which optional profile fields are returned by the authenticated user-list endpoint. The existing app does not yet provide a dedicated public profile page.
