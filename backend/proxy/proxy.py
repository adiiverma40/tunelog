# For proxy of navidrome to create a somewhat like tunnel

# iissue : /event endpoint is a sse 
# fix : create a sepeate sse for /event



from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import StreamingResponse
import httpx
import os
import asyncio

NAVIDROME_URL = os.getenv("BASE_URL")

app = FastAPI()

client = httpx.AsyncClient(timeout=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_all(request: Request, path: str):
    url = f"{NAVIDROME_URL}/{path}"
    
    headers = dict(request.headers)
    headers.pop("host", None)

    if "api/events" in path:
        req = client.build_request(
            request.method,
            url,
            headers=headers,
            params=request.query_params,
        )
        
        resp = await client.send(req, stream=True)

        async def event_stream():
            try:
                async for chunk in resp.aiter_bytes():
                    if chunk:
                        yield chunk
            except (httpx.ReadError, asyncio.CancelledError):
                print("SSE stream disconnected")
            finally:
                await resp.aclose()

        return StreamingResponse(
            event_stream(),
            status_code=resp.status_code,
            headers={
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no", 
            },
        )
    body = await request.body()
    resp = await client.request(
        request.method,
        url,
        headers=headers,
        params=request.query_params,
        content=body,
    )

    excluded = {"content-length", "transfer-encoding", "content-encoding"}
    resp_headers = {
        k: v for k, v in resp.headers.items()
        if k.lower() not in excluded
    }

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=resp_headers,
    )

@app.on_event("shutdown")
async def shutdown_event():
    await client.aclose()