# SlotFinder – Free Slot Identification in Vehicle Booking Systems

A full-stack web application that **identifies free parking slots** for a chosen vehicle type and time window, lets users book them, and prevents double booking.

**Tech stack:** HTML5, CSS3, JavaScript (frontend) · Node.js, Express.js (backend) · MongoDB with Mongoose (database) · JWT authentication

---

## Features

| Module | Features |
|---|---|
| **Free slot identification** | Search by vehicle type (Car / Bike / EV / Truck) and time window; server-side time-overlap algorithm lists only truly free slots with estimated cost |
| **Next-free suggestion** | When all slots are full, calculates the earliest time a slot becomes free for the same duration |
| **Live slot map** | Colour-coded grid (free / occupied / inactive) with live stats, auto-refreshes every 30 s |
| **Day view timeline** | 24-hour timeline per slot showing booked and free windows, with a current-time marker |
| **Booking** | Book a slot, booking summary with amount, re-check at booking time (no double booking), same vehicle cannot be in two slots at once |
| **My bookings** | Filter by Upcoming / Active / Completed / Cancelled, cancel bookings |
| **Authentication** | Register / Login with JWT, hashed passwords (bcrypt), role-based access (user / admin) |
| **Admin panel** | Add / edit / delete / deactivate slots, view all bookings with search, cancel any booking, stats (total, active, cancelled, revenue) |
| **Responsive UI** | Works on mobile, tablet and desktop |

## Input validation (client **and** server)

Every rule is checked in the browser (`public/js/validation.js`, live messages under each field) **and again on the server** (`middleware/validate.js` using express-validator + Mongoose schema rules).

| Field | Rule |
|---|---|
| Name | Required, 3–50 chars, letters and spaces only |
| Email | Required, valid format, must be unique |
| Mobile | Required, exactly 10 digits, starts with 6–9, digits only while typing |
| Password | Min 8 chars, upper + lower + number + special character, strength meter |
| Confirm password | Must match password |
| Vehicle type | Must be one of car / bike / ev / truck |
| Start time | Required, not in the past, at most 30 days ahead |
| End time | After start, minimum 30 minutes, maximum 24 hours |
| Vehicle number | Indian format e.g. `TN01AB1234` (auto-uppercased) |
| Slot number | Format `A-01`, unique |
| Floor | Whole number 0–10 |
| Price per hour | 1–1000 |
| Terms checkbox | Must be accepted before booking |

## How free slots are identified

Two time intervals overlap when `existing.start < requested.end AND existing.end > requested.start`.

1. Fetch all **active** slots of the requested vehicle type.
2. Find **booked** (not cancelled) bookings on those slots that overlap the requested window.
3. **Free slots = all slots − slots with an overlapping booking.**
4. If none are free, for each slot walk its future bookings in order and push the candidate start past each colliding booking; the earliest result is suggested.

Code: [`utils/freeSlots.js`](utils/freeSlots.js)

## Project structure

```
├── server.js              # Express app entry point
├── seed.js                # Creates admin user + sample slots
├── config/db.js           # MongoDB connection
├── models/                # Mongoose schemas: User, Slot, Booking
├── middleware/            # auth.js (JWT, admin), validate.js (server validation)
├── routes/                # auth.js, slots.js, bookings.js (REST API)
├── utils/freeSlots.js     # Free slot identification algorithm
├── tests/api.test.js      # Automated API tests
└── public/                # Frontend
    ├── index.html  login.html  register.html
    ├── dashboard.html  timeline.html  bookings.html  admin.html
    ├── css/style.css
    ├── images/parking-bg.svg  favicon.svg
    └── js/ api.js  validation.js  register.js  dashboard.js  admin.js
```

## REST API

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Register user |
| POST | `/api/auth/login` | Public | Login, returns JWT |
| GET | `/api/auth/me` | User | Current user |
| GET | `/api/slots/available?vehicleType&startTime&endTime` | User | **Free slots** + suggestion |
| GET | `/api/slots/status` | User | Live occupancy of all slots |
| GET | `/api/slots/day?date=` | User | Bookings per slot for a day |
| GET / POST | `/api/slots` | Admin | List / create slots |
| PUT / DELETE | `/api/slots/:id` | Admin | Update / delete slot |
| POST | `/api/bookings` | User | Book a slot |
| GET | `/api/bookings/mine` | User | My bookings |
| PATCH | `/api/bookings/:id/cancel` | Owner / Admin | Cancel booking |
| GET | `/api/bookings` | Admin | All bookings |
| GET | `/api/bookings/stats` | Admin | Stats |

---

## Setup and connecting to MongoDB

### 1. Install Node.js
Download the LTS version from https://nodejs.org and install. Check with:
```bash
node -v
npm -v
```

### 2. Install project dependencies
```bash
npm install
```

### 3. Set up MongoDB — choose **one** option

#### Option A: MongoDB on your own computer (local)
1. Download **MongoDB Community Server** from https://www.mongodb.com/try/download/community (Windows, MSI).
2. Run the installer → choose **Complete** → keep **"Install MongoD as a Service"** ticked → also tick **Install MongoDB Compass** (GUI).
3. MongoDB now runs automatically on `mongodb://127.0.0.1:27017`.
   To check: open *Services* (Win+R → `services.msc`) and confirm **MongoDB Server** is *Running*.
4. Your connection string is:
   ```
   mongodb://127.0.0.1:27017/slotbooking
   ```
   (`slotbooking` is the database name; MongoDB creates it automatically on first write.)

#### Option B: MongoDB Atlas (free cloud database)
1. Sign up at https://www.mongodb.com/cloud/atlas/register.
2. Create a **free M0 cluster** (any region close to you).
3. **Database Access** → *Add New Database User* → choose username + password (avoid `@`, `#`, `/` in the password or URL-encode them) → role *Read and write to any database*.
4. **Network Access** → *Add IP Address* → *Allow access from anywhere* (`0.0.0.0/0`) for development.
5. **Database → Connect → Drivers → Node.js** → copy the connection string, e.g.
   ```
   mongodb+srv://myuser:mypassword@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority
   ```
6. Insert the database name before the `?`:
   ```
   mongodb+srv://myuser:mypassword@cluster0.abcde.mongodb.net/slotbooking?retryWrites=true&w=majority
   ```

### 4. Create the `.env` file
Copy `.env.example` to `.env` (Windows PowerShell: `copy .env.example .env`) and edit it:
```env
MONGO_URI=mongodb://127.0.0.1:27017/slotbooking     # or your Atlas string
PORT=5000
JWT_SECRET=any_long_random_text_here
JWT_EXPIRES_IN=1d
```
> `.env` is in `.gitignore` so your password is never pushed to GitHub.

### 5. Add sample data (admin + slots)
```bash
npm run seed
```
Output should show `MongoDB connected` and `Admin created -> admin@slotfinder.com / Admin@123`.

### 6. Start the server
```bash
npm start        # or: npm run dev  (auto-restart on file change)
```
Open **http://localhost:5000**

### 7. Run the automated tests
```bash
npm test
```
Runs 24 API tests (validation, free-slot search, double-booking prevention, next-free suggestion, cancel, admin). They use a separate `slotbooking_test` database that is deleted afterwards, so your real data is not touched.

### 8. Check the data in MongoDB
- **Compass:** connect with the same `MONGO_URI` → database `slotbooking` → collections `users`, `slots`, `bookings`.
- **Atlas:** *Database → Browse Collections*.

### Troubleshooting
| Error | Fix |
|---|---|
| `connect ECONNREFUSED 127.0.0.1:27017` | Local MongoDB is not running – start the *MongoDB Server* service |
| `bad auth : authentication failed` | Wrong Atlas username/password in `MONGO_URI` |
| `querySrv ENOTFOUND` / timeout | Atlas Network Access doesn't allow your IP, or your network blocks port 27017 |
| `MONGO_URI is not set` | `.env` file missing or in the wrong folder (must be next to `server.js`) |
| `Port 5000 is already in use` | Stop the other server (Ctrl+C) or change `PORT` in `.env` |

---

## Pushing to GitHub

```bash
git init
git add .
git commit -m "Free Slot Identification in Vehicle Booking System"
git branch -M main
git remote add origin https://github.com/<your-username>/free-slot-booking.git
git push -u origin main
```
(Create the empty repository on github.com first, without a README.)

## Demo accounts
- **Admin:** `admin@slotfinder.com` / `Admin@123` (created by `npm run seed`)
- **User:** register a new account from the Register page
