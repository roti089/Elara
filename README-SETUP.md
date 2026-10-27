# Elara: setup guide

Everything lives in **one folder**. Open it in VS Code and start **Live Server** on `Homepage.html`
(the login page uses a JavaScript module, which browsers won't run from a `file://` path).

Steps 1 to 4 are needed. Steps 5 to 10 switch on the extra features; each one is optional and the app keeps
working without it.

| Feature | Needs |
|---|---|
| Login, dashboards, household sharing, backups, reports, in-app notifications | Steps 1 to 4 |
| Invitation emails | Steps 4 and 5 |
| Push notifications when Elara is closed, task/event reminders | Step 6 |
| Elara AI answers (local commands and meal ideas work without it) | Step 7 |
| CBi / Smart Life switches | Step 8 |
| Importing a calendar **link** (importing a `.ics` file works without it) | Step 9 |

---

## 1. Files
```
Homepage.html  About.html  Contactus.html  Loginpage.html     public pages
dashboard-*.html / .css / .js                                 the app (9 pages, incl. the new Reports page)
elara-config.js     settings (Supabase URL + publishable key, function URLs, VAPID key)
elara-data.js       data layer: sync, household sharing, permissions, backups, energy, notifications
elara-common.js     sidebar, theme, bell, voice control, location consent, automations
elara-assistant.js  Elara assistant: commands, meal ideas from what's in the house, AI fallback
elara-sw.js         service worker: push notifications + offline copy of the app (must stay in the root folder)
elara-pwa.js        makes Elara installable on phones (with manifest.webmanifest, icons/, offline.html)
elara-setup.sql     the whole database setup (step 2)
supabase/functions/ five Edge Functions (steps 5 to 9)
_build/             the dashboard pages are generated from these: edit a fragment, then run  python3 _build/build.py
```
`elara-setup.sql` replaces the old `supabase-setup.sql` and `elara-household-setup.sql`. The invite function is now
`supabase/functions/bright-action` (the name your project already uses).

## 2. Database (run once, safe to run again)
Supabase > **SQL Editor** > New query > paste **all** of `elara-setup.sql` > **Run**.

It creates or updates:
* `elara_user_data`: everyone's data. Row Level Security decides who may read or change what (step 3).
* `elara_household_links`: invitations, roles and each member's permissions.
* `elara_profiles`: names and photos that members of the same home can see.
* `elara_notifications`, `elara_push_subscriptions`, `elara_reminders_sent`: notifications.
* `elara_backups`: cloud backups (owner only, 14 kept).
* A safe policy on your existing `contacts` table: visitors can **send** a message but can't read any.

> If the dashboard shows "Household sharing isn't set up in Supabase yet", this step hasn't been run.

The other tables in your project (`households`, `household_members`, `tasks`, `devices`, ...) are **not used** by Elara.
You can leave them or delete them.

## 3. How sharing and permissions work
* The person who signs up and invites others is the **home owner**. Everyone they invite joins **the owner's home**
  and sees the **same dashboard and the same data**.
* When inviting, the owner picks a role (Adult, Member, Guest) and can then set each area separately:
  **Hidden**, **View** or **Edit** for Tasks, Shopping, Schedule, Smart Home, Analytics and Reports.
  The owner can change this any time on the Members page (*Access*).
* This is enforced **by the database**, not only by the pages: a member with "View" on Smart Home can't switch a
  device even with developer tools open, and a hidden area is never sent to their browser.
* Personal things stay personal: name, photo, phone, theme, notification settings, location and voice settings.
* Availability (busy / away / available per day) and home/away presence can be set by everyone for themselves;
  the owner can change anyone's.

## 4. Supabase Authentication settings
1. **Authentication > URL Configuration**: Site URL `http://127.0.0.1:5500`; Redirect URLs: add `http://127.0.0.1:5500/**`
   (and your real website address later). Without this, confirmation, reset and invitation links can't come back.
2. **Authentication > Providers**: switch on Google / GitHub / LinkedIn (OIDC) if you want those buttons to work.
3. **Authentication > Emails > SMTP Settings**: turn on custom SMTP (Brevo, Resend, ...). Supabase's built-in sender only
   delivers to your own team, about 2 emails an hour.
4. **Authentication > Multi-Factor**: make sure **TOTP** is enabled if you want two-factor sign-in.
5. Passwords: Elara requires 8+ characters with a letter and a number. Set **Authentication > Policies > Minimum password
   length** to 8 so Supabase enforces the same.

## 5. Invitation emails (`bright-action`)
Supabase > **Edge Functions** > your `bright-action` function > replace its code with
`supabase/functions/bright-action/index.ts` > Deploy. (CLI: `supabase functions deploy bright-action`.)
No secrets needed. Only the home owner can invite, at most 20 invitations a day, and the role/permissions are saved
before the email goes out. The invited person clicks the link, chooses a password and lands in the owner's home.

Invitation links point at the address the owner is using. While you run on `127.0.0.1` they only work on your own
computer, so publish the site before inviting other people.

## 6. Push notifications and reminders (`elara-push`)
Without this step, notifications still appear in the **bell** for everyone in the home (in real time).
With it, they also pop up on phones and computers when Elara is closed, and reminders are sent automatically.

1. Create a VAPID key pair once (any computer with Node): `npx web-push generate-vapid-keys`
2. Put the **public** key in `elara-config.js` > `vapidPublicKey`.
3. Deploy and set the secrets:
```
supabase functions deploy elara-push --no-verify-jwt
supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com CRON_SECRET=pick-a-long-random-text
```
   (`--no-verify-jwt` lets the scheduled job below call it; the function checks every signed-in caller itself.)
4. Reminders (tasks due and overdue, events in the next 30 minutes, warranties ending): in the SQL Editor run
```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('elara-reminders', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://shyvyrvxashetxnmosnd.supabase.co/functions/v1/elara-push',
    headers := '{"Content-Type":"application/json","x-elara-cron":"pick-a-long-random-text"}'::jsonb,
    body := '{"action":"cron"}'::jsonb);
$$);
```
5. Each person turns on **Settings > Notifications > Push notifications** on each device and presses **Send a test**.
   On iPhone, push only works after adding Elara to the Home Screen (Safari > Share > Add to Home Screen).

Who gets what: assigned/completed tasks, new events (with a special warning to anyone **busy or away** that day),
items added to or bought from the shopping list, devices switched by someone else, Away Mode, access changes,
password changes and backups restored. Each person can switch every category off for themselves.

## 7. Elara AI (`elara-ai`): free with Groq, or paid with Anthropic
Without this step the built-in assistant still handles commands ("add milk", "turn off the geyser", "I'm busy on Friday",
"add task clean the garage for Thabo tomorrow at 5pm") and suggests meals from about 25 built-in recipes. This step adds
answers to open questions and smarter meal ideas from what's in the house.

**Free: Groq** (no card; about 1,000 questions a day, plenty for a household)
1. Sign up at **console.groq.com** > **API Keys** > **Create API Key**. Copy it (starts with `gsk_`).
2. Supabase > **Edge Functions** > **Deploy a new function** > **Via Editor**, name it `elara-ai`, paste
   `supabase/functions/elara-ai/index.ts`, **Deploy** (leave "Verify JWT" on).
3. **Edge Functions > Secrets**: add `GROQ_API_KEY` = your key.
   (CLI instead: `npx supabase functions deploy elara-ai` and `npx supabase secrets set GROQ_API_KEY=gsk_...`.)

**Paid: Anthropic (Claude)**: set `ANTHROPIC_API_KEY` instead (console.anthropic.com, needs credit). If both keys are set,
Anthropic is used.

The key only ever goes into Supabase secrets, never into `elara-config.js` or the website files.
Elara sends the AI a short summary of the home that the asking person is allowed to see; don't add a key from a service
whose terms you aren't comfortable with for that.

## 8. CBi / Smart Life switches, real energy and automations (`elara-tuya`)
This is what makes Smart Home, Analytics and the energy part of Reports work. Elara shows **only real switches** and
**only measured energy**: nothing is estimated or made up. A switch without a power meter can still be switched, it just
shows no energy.

CBi Home is the Smart Life app with CBi's name on it; Tuya only lets Elara link to **Smart Life**, so move each switch:
1. In CBi Home delete the device, put the switch in pairing mode, add it in **Smart Life** (by category if scanning finds
   nothing: Electrical > Switch Module). Check you can switch it in Smart Life.
2. At **iot.tuya.com** create a Cloud project (pick the data centre of your Smart Life account; South African accounts are usually on Central Europe), then
   **Devices > Link App Account** and scan the QR code with Smart Life. Copy the Access ID, Access Secret and the UID.
3. Deploy (note `--no-verify-jwt`: the scheduled job below has no login; every person's call is still checked inside):
```
supabase functions deploy elara-tuya --no-verify-jwt
supabase secrets set TUYA_ACCESS_ID=... TUYA_ACCESS_SECRET=... TUYA_UID=... TUYA_BASE_URL=https://openapi.tuyaeu.com
supabase secrets set TUYA_ALLOWED_EMAILS=owner@example.com CRON_SECRET=pick-a-long-random-text
```
   `TUYA_ALLOWED_EMAILS` is **required** (the home owner's login email). Use the same `CRON_SECRET` as in step 6.
4. Smart Home > **CBi Home** > **Import / refresh switches**. Give each one a room and a **type** with its pencil button
   (the type drives the Lights / Geyser / Aircon buttons and the suggested automations).
5. Make the readings and automations run every 5 minutes, even when nobody has Elara open. SQL Editor:
```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('elara-switches', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://shyvyrvxashetxnmosnd.supabase.co/functions/v1/elara-tuya',
    headers := '{"Content-Type":"application/json","x-elara-cron":"pick-a-long-random-text"}'::jsonb,
    body := '{"action":"cron"}'::jsonb);
$$);
```
6. In `elara-config.js` set `serverAutomations: true` (so open screens don't also run the automations).

**How energy is measured:** each reading of a switch's power (watts) is stored with the time. Energy between two readings
= average power x time, added to the right hour. Readings come from the scheduled job (every 5 minutes) and from any open
Elara screen (every `tuyaPollSeconds`). If a meter also reports a running total (`total_forward_energy`), gaps are filled from
that; otherwise a gap longer than 30 minutes (Wi-Fi down) is left out rather than guessed. Who used it: the energy of a
switch is counted for the person who last switched it on in Elara; switching in the CBi app or by an automation counts as
"Automations / CBi app".

**Automations** (Smart Home page): pick the switches, on or off, and when: at a time (with days), at sunset or at sunrise
(with an offset, needs the home location in Settings), or **Run now** scenes such as Away Mode. Settings > Smart Home
pauses all of them at once.

## 9. Calendar link import (`elara-ics`)
```
supabase functions deploy elara-ics
```
**Sync Calendar** on the Schedule page adds events from your phone or computer calendar and **never removes** existing ones:
* **File**: export the calendar as `.ics` (Google Calendar > Settings > Import & export; Outlook > Save calendar; iPhone:
  share the calendar) and choose the file. Works without this function.
* **Link**: paste the calendar's private iCal address (Google: *Secret address in iCal format*). Needs this function,
  because browsers aren't allowed to download other websites' calendars directly. Saved links stay on that device only
  (they are private) and sync again each time the Schedule opens.

A website can't read the calendar app on a phone directly; the file or link is how the calendar gets to Elara.

## 10. Location
The first time someone opens a dashboard, Elara **asks** before using their location. It's used for the weather,
sunrise and sunset (adaptive lighting) and the home's time zone. Change it any time in **Settings > Location**.
The owner can also type the home address under **Settings > Home**.

## Backups
* Automatic: once a day when the owner opens Elara, a backup is saved in Supabase (the last 14 are kept).
* **Settings > Backup & Restore**: back up now, download a file, restore a cloud backup or a file.
  Restoring makes a safety backup first. Deleting the home also makes one first.

## Reports
The **Reports** page shows, per person and for any period: switch-ons, energy (kWh and Rand, counted for whoever switched
each device on), grocery spending (whoever marked items as bought), tasks created / assigned / completed / overdue,
and events added. Export to CSV, or Print / Save as PDF.

## Voice control
Press the microphone in the top bar (or in the Dashboard chat) and speak. Works in Chrome, Edge and Safari (not Firefox,
which has no speech recognition). Elara can read replies aloud; both are in **Settings > Smart Home & Voice**.

## Phones and tablets (one app for web and phone)
Elara is a **Progressive Web App**: the same files run in a computer browser and install on a phone like a normal app
(own icon, full screen, push notifications, opens even with a weak signal). Web and phone use the same Supabase data,
so a task added on the phone appears on the computer straight away.

**1. Publish the folder online (phones can't open `127.0.0.1`).** Any free static host works and gives you `https://`:
* **Netlify**: app.netlify.com > Add new site > *Deploy manually* > drag the whole Elara folder in.
* **Vercel**: already set up (`vercel.json` sends your main address to the homepage). See "Vercel" below.
* **Cloudflare Pages** or **GitHub Pages** work the same way.

**2. Tell Supabase the new address.** Authentication > URL Configuration: set **Site URL** to your new address and add
`https://your-site.netlify.app/**` to **Redirect URLs** (keep the `127.0.0.1` one for testing on your computer).
Social logins (Google, GitHub, LinkedIn) also need this address in their own developer settings.

**3. Install it on each phone.**
* **Android (Chrome)**: open the site, log in, then tap **Install** on the banner, or **Settings > Appearance > Install**,
  or the browser menu > *Install app*.
* **iPhone / iPad (Safari)**: open the site, tap **Share** > **Add to Home Screen**. Push notifications on iPhone only
  work in the installed app (iOS 16.4 or newer).
* **Computers (Chrome / Edge)**: the install icon in the address bar.

**Updating:** upload the changed files to the host, then change `CACHE = "elara-v4"` in `elara-sw.js` to a new number so
installed apps fetch the new version the next time they open.

**Offline:** pages you've opened before still load, showing the last data the device saw. Changes made offline are kept on
the phone and sent when it's back online. Sign-in, invitations, AI, weather and CBi need the internet.

**Want it in the Play Store / App Store too?** The same folder can be wrapped with **Capacitor** (`npx cap init`,
`npx cap add android`, `npx cap add ios`) later. You don't need that to use Elara on phones; the installed web app
above is the simplest way and updates itself.

## Vercel
* **Your address** is the one Vercel shows on the project page (for example `https://elara-xyz.vercel.app`). Opening it
  goes to `Homepage.html`.
* **Updating**: if the project is connected to GitHub, push the changed files and Vercel publishes them in about a minute.
  If you uploaded with the Vercel CLI, run `vercel --prod` in the Elara folder again. Every upload is a new "deployment";
  you can roll back to an older one on the Deployments page.
* **Settings to leave alone**: Framework Preset "Other", no build command, output directory = the folder itself.
* **Supabase**: add `https://your-project.vercel.app/**` to Redirect URLs and set it as Site URL. Vercel also makes a
  separate preview address for each deployment; logins only work on addresses you added, so use the main one.

## Staying free
**Supabase pausing.** Free Supabase projects pause after about a week without activity. `api/keepalive.js` stops that:
Vercel runs it once a day (the `crons` entry in `vercel.json`, free on Hobby) and it makes one tiny database request.
Nothing to do except upload the folder; check it under Vercel > your project > **Settings > Cron Jobs**.
Optional: add an Environment Variable `CRON_SECRET` (any long random text) so only Vercel can call it.
If the project was already paused, press **Restore** once in the Supabase dashboard.

**Vercel Hobby is for non-commercial use.** Fine for your own home or a school project. If Elara becomes a business,
move to **Cloudflare Pages** (free, commercial use allowed): Cloudflare dashboard > Workers & Pages > Create > Pages >
*Upload assets* > drop the Elara folder. `_redirects` and `_headers` are already included for it. Then put the new
address in Supabase (URL Configuration). The daily keep-alive is Vercel-only, so on Cloudflare also use Elara at least
weekly or add a free uptime monitor (for example UptimeRobot) pointed at
`https://shyvyrvxashetxnmosnd.supabase.co/rest/v1/elara_profiles?select=user_id&limit=1&apikey=YOUR-PUBLISHABLE-KEY`.

## Developing without logging in
In `elara-config.js` set `requireLogin: false` and `supabaseUrl: ""` to open the dashboards with demo data.
Put them back before publishing.

## Limits worth knowing
* Without the scheduled job in step 8, automations and energy readings only happen while Elara is open on a device.
* Energy is only shown for switches with a power meter. Sunrise and sunset times can be a few minutes off.
* Receipt **files** stay on the device they were added from; their details (store, total, date) are shared.
