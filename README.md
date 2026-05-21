# Brainskool Tools

A collection of educational tools (Abacus, flags, and administration dashboards) with a Node.js / Express backend and MongoDB database.

---

## 🚀 Deployment to Vercel

This repository is pre-configured to deploy seamlessly on Vercel as a hybrid application (static frontend files + Node.js Serverless API functions).

### 1. Project Configuration

The deployment is managed by:
* **[vercel.json](file:///d:/project/brainskool/vercel.json)**: Configures request rewrites.
  * Router rules forward `/api/*` requests to our serverless entrypoint `api/index.js`.
  * Standard fallback maps other routes to `index.html` for single-page routing compatibility.
* **[api/index.js](file:///d:/project/brainskool/api/index.js)**: Serverless function wrapper that runs the Express backend and handles cached connections to MongoDB Atlas.

### 2. Environment Variables

When deploying to Vercel, you **must** configure the following environment variables in your Vercel Project Settings (under **Settings** > **Environment Variables**):

| Variable | Description | Example / Recommended Value |
| :--- | :--- | :--- |
| `MONGO_URI` | Your MongoDB Atlas connection string | `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/brainskool?retryWrites=true&w=majority` |
| `JWT_SECRET` | Secret key used for signing JWT login tokens | *A long, random, secure string* |
| `ADMIN_RESET_SECRET` | Secret token used to reset the administrator password | *A secure random secret* |

### 3. Deploy Steps

1. Push this repository to GitHub (or import it into Vercel).
2. Go to [Vercel Dashboard](https://vercel.com) and click **Add New** > **Project**.
3. Import your repository (`brainskool-tools`).
4. In the **Environment Variables** section, add the three variables listed above.
5. Click **Deploy**.

---

## 💻 Local Development

To run the application locally on your machine:

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Local Environment
Copy `.env.example` to `.env` and fill in the values:
```bash
cp .env.example .env
```

### 3. Start the Server
* **Development mode** (runs with hot-reloading via nodemon):
  ```bash
  npm run dev
  ```
* **Production mode**:
  ```bash
  npm start
  ```

Once started, open `http://localhost:3000` in your browser.
