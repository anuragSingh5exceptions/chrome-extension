# My Custom Homepage — Privacy Policy

Draft for publication · Updated October 15, 2026

My Custom Homepage (also displayed as “A little space”) is a Chrome new-tab extension developed by Anurag Singh. It provides a clock, search, shortcuts, a focus field, a weekend calculator, optional browsing history, and optional Google Calendar meetings.

## Information used

**Homepage preferences.** Your name, theme, layout, shortcuts, focus text, selected search engine, and background photo are stored locally in the extension's browser storage. A connection preference records whether you connected Google Calendar. Settings exports contain your homepage preferences and background photo, but not your browsing history, Calendar events, or OAuth tokens. You choose where to save an export and who receives it.

**Google Calendar.** If you connect Google Calendar, the extension requests the `calendar.events.readonly` OAuth scope. Google describes this scope as permission to view events on calendars you can access. The current extension queries only your primary calendar to display today's remaining events, titles, start/end times, event links, video meeting links, and whether you declined an invitation. It uses that information only to provide the meetings card. It does not create, edit, or delete Calendar events.

Calendar requests go directly from the extension to Google's API. Calendar results are held in page memory to display the card; the extension does not persist them in its settings or settings backups. Chrome's Identity API manages OAuth token caching. This extension does not write OAuth tokens to its local settings, exports, or an application server.

**Browsing history.** If you enable the optional history permission, the extension reads Chrome history to show and search recently visited pages, including page titles, addresses, and visit times. This feature does not send your history to the developer or an application server and does not include history in settings backups.

**Search and links.** Submitting a search sends your query to your selected search provider. Opening a shortcut, event, meeting, or other website link takes you to that service, which handles your activity under its own privacy policy.

## Storage and sharing

The current extension has no developer-operated backend, analytics, advertising, or sale of personal data. It does not send your Calendar events, history, preferences, or background photo to the developer or use them to train AI models. Google receives the authorization and API requests needed for the Calendar connection. Other services receive requests when you explicitly search or open their links.

Use and transfer of information received from Google APIs must follow the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including its Limited Use requirements. Calendar data is used only for the visible meetings feature.

## Your controls

- Connecting Calendar and enabling history are optional. Other homepage features work without them.
- Hide the meetings card in Customize to stop new syncs and clear its displayed events while keeping the connection preference.
- Click Disconnect to clear this extension's cached Google authentication state and stop automatic Calendar sync.
- To revoke Google's authorization grant, remove the app from [Google Account connections](https://myaccount.google.com/connections).
- Manage or revoke extension permissions in Chrome's extension settings. Remove saved preferences and background photos through the extension's settings or by clearing this extension's local browser storage. Remove any exported backup files separately.
- Browser history remains managed by Chrome; hiding the history sidebar clears the displayed list, not Chrome's history.

## Contact and updates

Contact: anurag5exceptions@gmail.com

This policy should be updated when the extension's data practices change. Review the published policy for its latest update date.
