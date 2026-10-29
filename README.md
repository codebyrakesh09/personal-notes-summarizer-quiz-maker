# Study Buddy

A small web app that turns pasted study notes into a summary or an interactive,
multiple-choice practice quiz.
The browser sends notes to a FastAPI server, and the server calls the OpenAI API.

## Run locally

1. Create and activate a virtual environment:

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```

2. Install the Python packages:

   ```powershell
   pip install -r requirements.txt
   ```

3. Copy `.env.example` to `.env` and set `OPENAI_API_KEY` to your own API key.
   The key is read by the server and is never sent to the browser.

4. Start the server:

   ```powershell
   uvicorn main:app --reload
   ```

5. Open <http://127.0.0.1:8000>.

The API accepts notes up to 20,000 characters and a mode of `summary` or `quiz`.
Quiz mode returns five questions with four choices each. The browser checks the
answers and shows your score and explanations. If the AI key is missing, the
server returns a clear setup message.

You can also upload a UTF-8 `.txt` or text-based PDF (up to 5 MB and 100 pages).
Extracted text is placed in the notes box so you can review or edit it before
using the AI. Scanned/image-only PDFs, encrypted PDFs, and files over 20,000
extracted characters are not supported.
