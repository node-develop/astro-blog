import os
from fastapi import FastAPI
import uvicorn

app = FastAPI(title="artka-agents")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "agents"}


def run() -> None:
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")


if __name__ == "__main__":
    run()
