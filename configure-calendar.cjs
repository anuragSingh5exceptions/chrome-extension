'use strict';
const fs = require('node:fs');
const path = require('node:path');
function configure(clientId, manifest) {
  if (typeof clientId !== 'string' || !/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId)) {
    throw new Error('Pass the public OAuth client ID for a Chrome Extension client, ending in .apps.googleusercontent.com. Do not pass a client secret.');
  }
  return { ...manifest, oauth2: { client_id:clientId, scopes:['https://www.googleapis.com/auth/calendar.events.readonly'] } };
}
if (require.main === module) {
  try {
    const target = path.join(__dirname,'manifest.json');
    const next = configure(process.argv[2],JSON.parse(fs.readFileSync(target,'utf8')));
    fs.writeFileSync(target,JSON.stringify(next,null,2)+'\n');
    console.log('Calendar OAuth configured. Reload the extension in chrome://extensions, open a new tab, and click Connect Google Calendar.');
  } catch (error) { console.error(error.message);process.exitCode=1; }
}
module.exports = { configure };
