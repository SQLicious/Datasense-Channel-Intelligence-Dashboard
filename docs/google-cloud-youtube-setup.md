# Google Cloud Setup for Senseofdata YouTube Dashboard

This app supports two YouTube access paths:

- Public API key for public channel, video, and published comment data.
- Owner OAuth for data that requires the channel owner to grant YouTube access.

## 1. Create the Google Cloud project

1. Open https://console.cloud.google.com/
2. Create a project named `senseofdata-dashboard`.
3. Open **APIs & Services > Library**.
4. Enable **YouTube Data API v3**.

## 2. Create the public API key

1. Open **APIs & Services > Credentials**.
2. Select **Create credentials > API key**.
3. Copy the API key.
4. For production, restrict the key to YouTube Data API v3 and the deployed app domain.

Add it to `.env.local`:

```env
YOUTUBE_CHANNEL_HANDLE=@Senseofdata
YOUTUBE_API_KEY=your_api_key_here
```

## 3. Configure OAuth consent

1. Open **APIs & Services > OAuth consent screen**.
2. Choose the external user type unless the owner account is inside a Google Workspace organization.
3. Add the required app name and support email.
4. Add the channel owner as a test user while the app is in testing.
5. Add this scope:

```text
https://www.googleapis.com/auth/youtube.force-ssl
```

## 4. Create OAuth web credentials

1. Open **APIs & Services > Credentials**.
2. Select **Create credentials > OAuth client ID**.
3. Choose **Web application**.
4. Add this local redirect URI:

```text
http://localhost:3000/api/auth/youtube/callback
```

5. After Vercel deployment, add the production redirect URI:

```text
https://your-vercel-domain.vercel.app/api/auth/youtube/callback
```

Add the OAuth values to `.env.local`:

```env
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
YOUTUBE_REDIRECT_URI=http://localhost:3000/api/auth/youtube/callback
```

## 5. Run the local flow

Start the app:

```powershell
npm run dev
```

Open:

```text
http://localhost:3000
```

Use **Sync public data** first to confirm the API key path.

Then send the channel owner to:

```text
http://localhost:3000/api/auth/youtube/start
```

After consent, the app stores the refresh token server-side in local ignored storage and can sync as `owner_connected`.
