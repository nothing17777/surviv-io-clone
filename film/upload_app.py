"""Film studio: make episodes and upload them to YouTube.

    cd film && python3 -m streamlit run upload_app.py

Make: pick an episode idea, record it from a bots-only match and auto-edit it.
Upload: review an edited episode (video, thumbnail, title, description) and send it
to YouTube with its custom thumbnail. Uploads start private; public needs a tick.

Auth reuses the OAuth token from league_clipped (paths in the sidebar). Nothing
secret is copied into this repo. Note the token uploads to whichever channel it
was authorised for.
"""
import datetime as dt
import json
import pickle
import re
import subprocess
import time
from pathlib import Path

import streamlit as st

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"
STATE = OUT / "uploads.json"
LEAGUE = Path("/Volumes/T7 Shield/league_clipped")
DEFAULT_TOKEN = LEAGUE / "youtube_token.pickle"
DEFAULT_SECRETS = Path(
    "/Volumes/T7 Shield/Project/Vibe Code Projects/github_shorts/github-repo-shorts/client_secrets.json")
SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
RETRY_STATUS = {500, 502, 503, 504}

st.set_page_config(page_title="Surviv Film Studio", page_icon="🎬", layout="wide")


# ---------------------------------------------------------------- youtube
def youtube_client(token_path, secrets_path, interactive=False):
    """Authorised client; refreshes the token, or runs the browser consent flow."""
    import google_auth_oauthlib.flow
    import googleapiclient.discovery
    from google.auth.transport.requests import Request

    token_path = Path(token_path)
    creds = pickle.loads(token_path.read_bytes()) if token_path.exists() else None
    if creds and not creds.valid and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except Exception:
            creds = None
    if not creds or not creds.valid:
        if not interactive:
            raise RuntimeError("No usable token. Use 'Re-authorise' in the sidebar.")
        flow = google_auth_oauthlib.flow.InstalledAppFlow.from_client_secrets_file(
            str(secrets_path), SCOPES)
        creds = flow.run_local_server(port=0)
    token_path.write_bytes(pickle.dumps(creds))
    token_path.chmod(0o600)
    return googleapiclient.discovery.build("youtube", "v3", credentials=creds,
                                           cache_discovery=False)


def upload(yt, video, thumb, title, desc, tags, privacy, publish_at, progress):
    import googleapiclient.http
    from googleapiclient.errors import HttpError

    status = {"privacyStatus": privacy, "selfDeclaredMadeForKids": False}
    if publish_at:
        # YouTube publishes a scheduled video itself; it has to sit private until then
        status = {**status, "privacyStatus": "private", "publishAt": publish_at}
    body = {"snippet": {"title": title, "description": desc, "tags": tags[:30],
                        "categoryId": "20"},  # Gaming
            "status": status}
    media = googleapiclient.http.MediaFileUpload(
        str(video), mimetype="video/mp4", resumable=True, chunksize=8 * 1024 * 1024)
    req = yt.videos().insert(part="snippet,status", body=body, media_body=media)
    response, tries = None, 0
    while response is None:
        try:
            s, response = req.next_chunk()
            if s:
                progress.progress(s.progress(), text=f"Uploading… {int(s.progress() * 100)}%")
        except HttpError as e:
            if e.resp.status in RETRY_STATUS and tries < 5:
                tries += 1
                time.sleep(2 ** tries)
                continue
            raise
    progress.progress(1.0, text="Uploaded")
    vid = response["id"]
    thumb_note = None
    if thumb and thumb.exists():
        try:
            yt.thumbnails().set(videoId=vid, media_body=googleapiclient.http.MediaFileUpload(
                str(thumb), mimetype="image/jpeg")).execute()
        except HttpError as e:
            # custom thumbnails need a phone-verified channel
            thumb_note = f"thumbnail not set ({e.resp.status}): verify the channel at youtube.com/verify"
    return vid, thumb_note


def quota_error(e):
    text = (str(getattr(e, "content", b"")) + str(e)).lower()
    return any(r in text for r in ("quotaexceeded", "uploadlimitexceeded", "ratelimitexceeded"))


# ---------------------------------------------------------------- episodes
def load_state():
    return json.loads(STATE.read_text()) if STATE.exists() else {}


def save_state(s):
    OUT.mkdir(exist_ok=True)
    STATE.write_text(json.dumps(s, indent=1))


def episodes():
    if not OUT.exists():
        return []
    # description.txt is the last thing edit.ts writes, so it marks a finished edit
    eps = [d for d in OUT.iterdir() if (d / "final.mp4").exists() and (d / "description.txt").exists()]
    return sorted(eps, key=lambda d: (d / "final.mp4").stat().st_mtime, reverse=True)


@st.cache_data(ttl=600)
def recipes():
    """id -> title, straight from recipes.ts via the recorder's --list."""
    r = subprocess.run(["npx", "tsx", "record.ts", "--list"], cwd=ROOT,
                       capture_output=True, text=True)
    out = {}
    for line in r.stdout.splitlines():
        m = re.match(r"^(\S+)\s{2,}(.+)$", line)
        if m and not line.startswith("Sourcing"):
            out[m.group(1)] = m.group(2)
    return out


def stream(cmd, box):
    """Run a command and show its output live."""
    lines = []
    proc = subprocess.Popen(cmd, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for line in proc.stdout:
        if line.startswith("Sourcing"):
            continue
        lines.append(line.rstrip())
        box.code("\n".join(lines[-25:]))
    proc.wait()
    return proc.returncode, "\n".join(lines)


# ---------------------------------------------------------------- sidebar
with st.sidebar:
    st.header("YouTube account")
    token_path = Path(st.text_input("Token file", str(DEFAULT_TOKEN)))
    secrets_path = Path(st.text_input("Client secrets (for re-authorising)", str(DEFAULT_SECRETS)))
    if token_path.exists():
        st.success("Token found")
    else:
        st.error("No token at that path")
    st.caption("Uploads go to whichever channel this token was authorised for. "
               "Re-authorise to pick a different channel.")
    if st.button("Re-authorise (opens browser)"):
        try:
            youtube_client(token_path, secrets_path, interactive=True)
            st.success("Authorised, token saved")
        except Exception as e:
            st.error(f"{type(e).__name__}: {e}")

st.title("🎬 Surviv Film Studio")
make_tab, upload_tab = st.tabs(["Make an episode", "Upload"])

# ---------------------------------------------------------------- make
with make_tab:
    st.caption("Needs the dev server running (pnpm dev in the repo root).")
    ideas = recipes()
    if not ideas:
        st.error("Couldn't read the episode ideas; run `pnpm install` in the repo root.")
    else:
        pick = st.selectbox("Episode idea", list(ideas), format_func=lambda k: f"{ideas[k]}  ·  {k}")
        c1, c2, c3 = st.columns(3)
        res = c1.selectbox("Resolution", ["1440", "2160", "1080", "720"], index=0)
        max_secs = c2.number_input("Max length of the match (s)", 60, 1800, 600, step=60)
        retries = c3.number_input("Re-rolls if the star dies early", 0, 10, 3)
        if st.button("Record + edit", type="primary"):
            box = st.empty()
            code, log = stream(["npx", "tsx", "record.ts", "--recipe", pick, "--res", res,
                                "--max", str(max_secs), "--retries", str(retries)], box)
            m = re.findall(r"-> (.+)$", log, re.M)
            if code != 0 or not m:
                st.error("Recording failed, see the log above.")
            else:
                st.info("Recorded, editing…")
                code, _ = stream(["npx", "tsx", "edit.ts", m[-1].strip()], st.empty())
                if code == 0:
                    st.success("Done! It's waiting in the Upload tab.")
                else:
                    st.error("Edit failed, see the log above.")

# ---------------------------------------------------------------- upload
with upload_tab:
    eps = episodes()
    state = load_state()
    if not eps:
        st.info("No edited episodes yet. Make one first.")
    else:
        def label(d):
            done = state.get(d.name)
            return f"{'✅ ' if done else ''}{d.name}"

        ep = st.selectbox("Episode", eps, format_func=label)
        info = json.loads((ep / "events.json").read_text())
        done = state.get(ep.name)
        if done:
            st.success(f"Already uploaded ({done['privacy']}) on {done['at']}: "
                       f"https://youtu.be/{done['id']}")

        left, right = st.columns([3, 2])
        with left:
            st.video(str(ep / "final.mp4"))
        with right:
            thumb = ep / "thumbnail.jpg"
            if thumb.exists():
                st.image(str(thumb), caption="Thumbnail")
            st.metric("Kills", info.get("kills", 0))

        default_title = f"{info.get('title') or 'SURVIV.IO'} | Surviv.io"
        desc_p = ep / "description.txt"
        title = st.text_input("Title", default_title, max_chars=100)
        desc = st.text_area("Description", desc_p.read_text() if desc_p.exists() else "", height=260)
        tags = st.text_input("Tags (comma separated)",
                             "surviv.io, survev, surviv, io games, hacker, noob vs hacker, 50v50, battle royale")
        c1, c2 = st.columns(2)
        privacy = c1.radio("Privacy", ["private", "unlisted", "public"], horizontal=True)
        schedule = c2.checkbox("Schedule instead (publishes itself later)")
        publish_at = None
        if schedule:
            d = c2.date_input("Day", dt.date.today() + dt.timedelta(days=1))
            t = c2.time_input("Time (local)", dt.time(17, 0))
            publish_at = dt.datetime.combine(d, t).astimezone().astimezone(dt.timezone.utc) \
                .strftime("%Y-%m-%dT%H:%M:%S.000Z")
        sure = privacy != "public" or st.checkbox("Yes, publish this publicly right away")

        if st.button("Upload to YouTube", type="primary", disabled=not sure):
            try:
                yt = youtube_client(token_path, secrets_path)
                bar = st.progress(0.0, text="Starting upload…")
                vid, note = upload(yt, ep / "final.mp4", thumb, title, desc,
                                   [t.strip() for t in tags.split(",") if t.strip()],
                                   privacy, publish_at, bar)
                state[ep.name] = {"id": vid, "title": title, "privacy": "scheduled" if publish_at else privacy,
                                  "at": dt.datetime.now().isoformat(timespec="seconds")}
                save_state(state)
                st.success(f"Uploaded: https://youtu.be/{vid}")
                if note:
                    st.warning(note)
            except Exception as e:
                if quota_error(e):
                    st.error("YouTube's daily upload quota is spent. Try again tomorrow.")
                else:
                    st.error(f"{type(e).__name__}: {str(e)[:400]}")
