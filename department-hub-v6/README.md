# Department Hub

One website for every department's **Help Tickets, Recurring (Checklist) tasks, Delegation boards and FMS processes** – with
department-wise access, Excel import and a live dashboard. It runs on your own computer; your data stays in one file.

## 1 · Install (one time, 5 minutes)

**Windows shortcut:** after installing Node.js, just double-click `START-HERE.bat`. It installs and starts everything.


1. Install **Node.js** (version **22.13 or newer** – the current "LTS" or "Current" button) from https://nodejs.org. No Python or Visual Studio needed.
2. Unzip this folder, then open a terminal / Command Prompt **inside the folder**
   (Windows: open the folder, click the address bar, type `cmd`, press Enter).
3. Run:

```
npm install
npm start
```

4. Open **http://localhost:3000** in your browser.

First sign-in: **admin@example.com** / **admin123** – change the password under *My profile*.

> Want to look around first? Stop the server (Ctrl+C), run `npm run demo`, start again with `npm start`.
> It adds sample departments, people, tasks and a process. Every demo user's password is `demo123`
> (e.g. `hr01@demo.com` is the HR HOD, `pc01@demo.com` is Process Coordination).

### Let your team open it from their computers
Keep the computer running `npm start`, find its IP address (Windows: `ipconfig`), and share `http://THAT-IP:3000`
(everyone must be on the same office network). To use another port: `set PORT=4000` then `npm start` (Windows) or `PORT=4000 npm start` (Mac/Linux).
For use over the internet, host it on a server behind HTTPS – ask your IT person.

## 2 · Who can do what

| Role | Access |
|---|---|
| **Admin** (one person) | Everything. Creates departments, HODs, Process-Coordination users, holidays. |
| **HOD** | Full edit on **their own department's** tickets, recurring, delegation and processes. Adds team members and decides what each person may see (*Admin → Team Access*): **Viewer** or **Editor**, per module. A HOD cannot grant access in another department. |
| **Team member** | Only what the HOD grants. Always sees and can update tasks **assigned to them**. |
| **Process Coordination** | **View-only on every department**. Cannot change anything, and a HOD cannot upgrade them. |

Permissions are enforced by the server, not just hidden buttons.

## 2b · Edit access page and Activity Log

*Admin → Users → Edit access* (or *Team Access → Edit access*) opens one page per person:

* **Profile & sign-in** – name, employee code, new password (with a **Generate** button), role, home department,
  **whole-account expiry**, *Account is active*, and *Ask to choose a new password at first sign-in*.
* **What can this person open?** – every department as a section, every module as a row with **No access / View / Edit**
  and an optional **access expiry** date-time per row (✕ clears a row). Quick set: *Everything · view*, *Everything · edit*,
  *Clear all*, and *Expire ticked rows in 1 hour / 1 day / 7 days / 30 days / Never*.
* An expired row or expired account simply stops working – nothing needs to be deleted.
* HODs see only their own department's section and can edit the profile of people in their own department (not roles).
* Admins cannot switch off or demote their own account (prevents lock-out).

*Admin → Activity Log* (admin only) lists the last 300 events, newest first: sign-ins, **failed sign-ins**, users created,
access changed (with the exact before → after), password resets/changes, role changes, account switched on/off and expiry changes.
Passwords are never written to the log.

## 2c · MIS Report – who sees what

*MIS Report* (left menu) scores work done and work done on time against a **benchmark** (default 85%, set by the admin in *Settings*).
Period buttons: **Week · Month · Quarter · YTD** or a custom date range. Filters: department, task type, process, and *Include carried forward*
(earlier tasks that are still not done). Each score shows the change **vs the previous period**, the **gap vs benchmark** and a
**module streak health** (how many live modules are on target).

| Role | The report covers |
|---|---|
| **Admin** (and Process Coordination, view-only) | **All departments** – the grand total, with a department-by-department breakdown. |
| **HOD** | **Their own department** *plus the work their people do or raise with other departments* (a task counts if it belongs to their department, is done by one of their people, or was raised by one of their people). The by-person table lists only their own department. |
| **Team member** | Their own work, plus any department the HOD gave them access to. |

The Dashboard uses exactly the same rules, and the admin/HOD home shows department, user and ticket counts, recent users and a workspace overview.
Work is counted by its **due date**: *completed* = finished, *on time* = finished on or before the due date (for process steps: before the planned time).
*Quarter* and *YTD* follow the financial-year month in Settings (default April). Admin → Settings also sets the weekly-off days.

## 2d · Process builder (FMS)

*Process → Create Process* has: basic details (name, description, type label, **time for graph**), **who can update steps**
(process owner / data-entry operator / step owner), **entry form fields** (text, long text, number, date, date & time, dropdown, checkbox, each optionally **Required**),
and **steps** with department → doer, optional **reviewer**, **plan by minutes/hours/days + TAT**, a per-step **checklist** (end a line with `*` to make it compulsory) and drag-to-reorder.
A step with a reviewer goes to *Review* first; the next step's clock starts only when the reviewer approves. Reviewers can send a step back for rework.

## 2e · Import your whole Google-Sheet workbooks (Import Center → ⚡ box)

Download your sheet from Google Sheets (**File → Download → Microsoft Excel**) and drop it on the ⚡ box. The app recognises the layout, shows what it found, and enters everything:

| Your workbook | What gets entered |
|---|---|
| **Checklist** (*Task List, Doer List, Master, Holiday List, Setup Sheet*) | People with their e-mail / extension, departments, every recurring task (**D W F M Q H** → Daily, Weekly, Fortnightly, Monthly, Quarterly, Half-yearly), the done / pending history from *Master*, the holiday list (company vs restricted), and the reminder time from *Setup Sheet*. |
| **Delegation** (*Doer List, Master*) | People (with phone and e-mail) and every delegated task, on a board you name. Done / open status and revision dates are kept. |
| **FMS** (*What / Who / How / When* rows, then *Planned / Actual / Status*) | A process with its steps (“By 18:00 (+2 days)” becomes a working-day rule), the entry-form fields, and every entry with its planned and actual times. You choose who each step belongs to. |

Importing the same file twice never duplicates anything. New people get the password **welcome123** and must change it at first sign-in.
Other sheets can still be imported list-by-list with column matching.

## 2f · E-mail reminders

*Admin → Settings → E-mail reminders.* Every doer gets **one e-mail a day** listing what is pending up to the next working day (overdue first) at the hour you choose, plus **instant e-mails** when something is assigned to them, waits for their review, or a new due date is requested.

1. Choose **SMTP** (Gmail: server `smtp.gmail.com`, port `587`, your address, and a Google **App Password**) or **Brevo** (free account → API key; works where SMTP is blocked).
2. Fill “From” name / e-mail and the address of your website (used for the Open buttons), tick **Send the daily reminder**, **Save**.
3. Press **Send a test e-mail**, then **Preview today’s reminders** to see who would get one, and who has no address.

Reminders go to the person’s **Reminder e-mail** (Users → Edit access), or their sign-in e-mail if that is empty. Weekly-off days and company holidays are skipped. *Admin → E-mail log* shows every message and any error.
**The server must be running at that hour** – on an office PC leave it on; free cloud plans that sleep will miss it.

## 2g · On a phone

The site adapts to phones: lists become cards, there is a bottom bar (Home · Tasks · Tickets · Delegation · More), dialogs open as bottom sheets and buttons are thumb-sized.
**Install it like an app:** open the address in Chrome (Android) → ⋮ → *Add to Home screen*; in Safari (iPhone) → Share → *Add to Home Screen*. Phones on the office Wi-Fi can use `http://<computer's IP>:3000`.

## 2h · MIS report extras

Below the scorecards: **module-wise strict streaks** (a week counts only if work done *and* on-time both meet the benchmark, with “broke because: N late + N not done in week YYYY/WW”), **score by department** (tap a row to see people; Process / Help ticket / Recurring / Delegation / Overall and a trend line), **top & bottom performers** (Overall / Work done / On time), the **company-level weekly performance** chart with the benchmark line and hover/tap details, and **“Why 67% / 64%?”** – click any name for the exact arithmetic. *Overall execution* = tasks done on time ÷ tasks assigned. Admins see every department; a HOD sees their own department plus the work their people do with others.

## 3 · Where each screen comes from

* **Dashboard** – totals, overdue, rework, status overview per module, department performance (team view) and your overdue work.
* **Help Ticket** – create (single or multiple doers, reviewer, proof required), Assigned to me / Created by me / Unassigned / Transferred, Open · In progress · Overdue · Closed · Archive · Hold · Not done, messages, review & rework.
* **Recurring Task** – Daily / Weekly / Fortnightly / Monthly / Quarterly / Yearly tasks that create themselves. Tabs Today · Overdue · This week · Next week · Last week · Unique task · Not done. Skips Sundays and the **Holiday Calendar**.
* **Delegation** – boards with colour and icon, private or shared with specific people, status tabs, My Task / Team Task, *request date change* (approved by the person who delegated), under-review approval.
* **Process (FMS)** – define an entry form (step 0) and steps with doer + time allowed. Each step's planned time starts when the previous step is done. Table view and Sheet (card) view, delay per step, on-time %, bottleneck chart, My / Team process tasks.
* **Review** – everything waiting for your approval.
* **Import Center** – see below.

## 4 · Importing your Google Sheets / Excel data

*Import Center* (left menu) → choose what you are importing → upload → match columns → import.

* In Google Sheets: **File → Download → Microsoft Excel (.xlsx)**. CSV also works.
* Your own column names are fine. We auto-match the obvious ones; you fix the rest in a dropdown.
* Rows with a problem (unknown person, bad date…) are skipped and listed with the row number so you can fix and re-upload only those.
* People and departments are matched by **name, employee code or email**.
* Dates can be `2026-10-05`, `05/10/2026` (day first), `5 Oct 2026` or real Excel dates.
* Available: **Users · Recurring tasks · Delegation tasks · Help tickets · FMS entries (bulk create) · FMS bulk done**. Each has a downloadable template.
* Add users and departments first, because tasks refer to them.

## 5 · Backups & housekeeping

* All data is in the **`data/hub.db`** file. Copy the `data` folder to back up; copy it back to restore.
* To start over, stop the server and delete the `data` folder.
* Forgotten admin password: stop the server, delete `data`, start again (this resets everything), or ask us for a reset script.

## 6 · What is not included (yet)

File attachments / file-upload fields and voice notes, WhatsApp / SMS notifications, *Split Process* (loop, direct, stagger, cross-process steps and conditional processes),
“Configure Activity”, 360° reports, KRA/KPI, goals, and the vendor / warehouse / IMS / BOM menus visible in your screenshots. The process *type* is a label only for now. The structure is ready for them
(`server.js` has one section per module, `public/pages-*.js` one page function per screen).

## Project layout

```
server.js      all API routes          importer.js  Excel/CSV import
core.js        permissions, recurrence, FMS logic   db.js  database tables
public/        the website (no build step needed)
seed-demo.js   optional sample data
```
