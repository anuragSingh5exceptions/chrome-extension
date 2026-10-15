# Google Calendar setup

The Upcoming meetings card uses Chrome's Identity API and Google Calendar's read-only events scope. It displays today’s remaining events from your **primary calendar**, including ongoing and all-day events. The list scrolls inside a compact card. Today ends at the next midnight in your device’s local time zone. It refreshes every five minutes while the homepage and card are visible, when you return to the tab, and when you click Sync.

## Current configuration

This checkout already includes the shared public OAuth client ID and the read-only Calendar events scope in `manifest.json`. Users do not need to generate their own OAuth credentials. The client is registered for extension ID `mhalahebaejehlddaoledajfkhaciiam`.

For this copy, reload the extension, open a new tab, and click **Connect Google Calendar**. The Google Cloud project must also have Calendar API enabled and allow the connecting account through its OAuth audience settings. In Testing mode, that account must be added as a test user.

For sharing, keep the installed extension ID identical to the registered ID. Chrome Web Store distribution or a matching manifest public key provides a stable ID; the OAuth client ID alone does not make unpacked installations use the same extension ID.

## Configure a different Google Cloud project

1. Load this folder as an unpacked extension in Chrome. Open `chrome://extensions`, enable Developer mode, and copy the ID shown for **My Custom Homepage**.
2. Create or select a project in [Google Cloud Console](https://console.cloud.google.com/).
3. Enable the [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com) in that project.
4. Configure the Google Auth Platform application's branding, audience, and data access. Request this scope:

   ```text
   https://www.googleapis.com/auth/calendar.events.readonly
   ```

   If the app is External and in Testing, add the Google account you will connect as a test user. Workspace administrators may need to allow the app. Google may require verification before you distribute an app using this scope to other users. Testing-mode authorization can expire and require reconnection.

5. In Google Auth Platform → Clients, create an OAuth client with application type **Chrome Extension**. Enter the extension ID from step 1 as the Item ID. Use a Chrome Extension client, rather than a web or desktop client.
6. From this project directory, run the following with the public client ID Google gives you:

   ```sh
   node configure-calendar.cjs YOUR_CLIENT_ID.apps.googleusercontent.com
   ```

   This adds `oauth2.client_id` and the read-only scope to `manifest.json`. Never add a client secret. The OAuth client ID is public configuration.
7. On `chrome://extensions`, click **Reload** for the extension. Close old new-tab pages and open a new tab.
8. Click **Connect Google Calendar** below the weekend card. Allow Google API access when Chrome asks, then approve read-only Calendar access in Google's sign-in flow. A signed-in Chrome profile may be required.

## Using the card

- Click **Join meeting** for a video conference or **View event** to open its Calendar page.
- Use **Customize → Upcoming meetings** to show or hide the card independently of the weekend calculator. Hiding stops new syncs and clears the displayed events; it keeps the connection for next time.
- Click **Disconnect** to clear this extension's cached OAuth tokens and stop automatic sync. To revoke the account-level grant as well, remove the app from [Google Account connections](https://myaccount.google.com/connections).
- Event details and OAuth tokens are never written to homepage settings or exported in settings backups. Chrome manages its token cache. Only a connection preference is stored locally. Calendar requests go directly to Google's API; no application server is involved.

## Troubleshooting

- **One-time Google setup is needed:** configure the OAuth client ID, reload the extension itself, then open a new tab.
- **Invalid client or redirect:** verify the OAuth client type is Chrome Extension and the Item ID matches the installed extension exactly. An unpacked extension's ID can change if its path changes. For distribution, follow Chrome's guide to keep a consistent extension ID with a manifest public key.
- **Access blocked:** check test users, the consent audience, and Workspace admin restrictions.
- **Google denied Calendar access:** enable Google Calendar API in the same project as the OAuth client and check that read-only event access is approved.
- **Sign-in expired:** reconnect using the Connect button. Automatic refresh never opens a sign-in popup.
- **No events:** only today’s remaining primary-calendar events are included; cancelled, declined, and non-default special events are excluded. Secondary/shared calendars are not yet included.

References: [Chrome OAuth setup](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth), [Chrome Identity API](https://developer.chrome.com/docs/extensions/reference/api/identity), [Google Calendar events API](https://developers.google.com/workspace/calendar/api/v3/reference/events/list).
