# Worker for navidrome request

import queue
import time

import requests
from core.config import Navidrome_url
from rich.console import Console
from Workers.worker_queue import ND_queue

console = Console()


ND_BASE = Navidrome_url
ND_HEADERS = {
    "User-Agent": "TuneLog/1.0 (https://github.com/adiiverma40/tunelog; adiiverma40@gmail.com)",
    "Accept": "application/json",
}


def get_authed_headers(decrypted_token: str) -> dict:
    if not decrypted_token:
        return ND_HEADERS
    return {**ND_HEADERS, "X-Nd-Authorization": f"Bearer {decrypted_token}"}

# def method_get(work, session):
#     url = f"{ND_BASE}/{work.endpoint.lstrip('/')}"

#     try:
#         r = session.get(
#             url,
#             params=work.params,
#             headers=get_authed_headers(work.token),
#             timeout=15,
#         )

#         r.raise_for_status()
#         if r.status_code == 404:
#             return {"status": "error", "error_msg": "404 Not Found"}

#         # --- Rate Limit Check Commented Out ---
#         # headers = r.headers
#         # remaining = int(headers.get("x-ratelimit-remaining", 1))
#         # reset_in = int(headers.get("x-ratelimit-reset-in", 0))
#         #
#         # console.print(
#         #     f"[dim]API Call Successful. Remaining requests: {remaining}[/dim]"
#         # )
#         #
#         # if remaining <= 0:
#         #     console.print(
#         #         f"[bold yellow]Rate limit hit! Sleeping thread for {reset_in} seconds...[/bold yellow]"
#         #     )
#         #     time.sleep(reset_in)
#         # else:
#         #     time.sleep(0.2)
#         # --------------------------------------

#         result = {"status": "success", "data": r.json()}

#     except requests.exceptions.RequestException as e:
#         console.print(f"[bold red]Worker API Error: {e}[/bold red]")
#         result = {"status": "error", "error_msg": str(e)}

#     return result


def method_get(work, session):
    url = f"{ND_BASE}/{work.endpoint.lstrip('/')}"

    try:
        r = session.get(
            url,
            params=work.params,
            headers=get_authed_headers(work.token),
            timeout=15,
        )

        r.raise_for_status()
        if r.status_code == 404:
            return {"status": "error", "error_msg": "404 Not Found"}

        content_type = r.headers.get("Content-Type", "")
        
        if content_type.startswith("image/"):
            result = {
                "status": "success", 
                "data": r.content, 
                "content_type": content_type
            }
        else:
            result = {
                "status": "success", 
                "data": r.json()
            }

    except requests.exceptions.RequestException as e:
        console.print(f"[bold red]Worker API Error: {e}[/bold red]")
        result = {"status": "error", "error_msg": str(e)}

    return result

def method_post(work, session):
    url = f"{ND_BASE}/{work.endpoint.lstrip('/')}"

    try:
        r = session.post(
            url,
            json=work.params,
            headers=get_authed_headers(work.token),
            timeout=15,
        )

        r.raise_for_status()
        if r.status_code == 404:
            return {"status": "error", "error_msg": "404 Not Found"}

        # --- Rate Limit Check Commented Out ---
        # headers = r.headers
        # remaining = int(headers.get("x-ratelimit-remaining", 1))
        # reset_in = int(headers.get("x-ratelimit-reset-in", 0))
        #
        # console.print(
        #     f"[dim]API Call Successful. Remaining requests: {remaining}[/dim]"
        # )
        #
        # if remaining <= 0:
        #     console.print(
        #         f"[bold yellow]Rate limit hit! Sleeping thread for {reset_in} seconds...[/bold yellow]"
        #     )
        #     time.sleep(reset_in)
        # else:
        #     time.sleep(0.2)
        # --------------------------------------

        result = {"status": "success", "data": r.json()}

    except requests.exceptions.RequestException as e:
        console.print(f"[bold red]Worker API Error: {e}[/bold red]")
        result = {"status": "error", "error_msg": str(e)}

    return result

    
def ND_Worker():
    console.print("[bold blue][WORKER][NAVIDROME]Starting Worker[/bold blue]")
    session = requests.Session()
    timeout = 600
    while True:
        try:
            work = ND_queue.getWork(timeout=timeout)
            result = None
            print(f"Working on: {work}")

            if work.method.lower() == "get":
                result = method_get(work, session)

            elif work.method.lower() == "post":
                result = method_post(work, session)

            else:
                result = {
                    "status": "error",
                    "error_msg": f"Unsupported method: {work.method}",
                }
            if result.get("status") == "success":
                if work.response_queue:
                    work.response_queue.put(result)

                elif work.on_success and result.get("status") == "success":
                    work.on_success(result.get("data"))
                elif work.on_error and result.get("status") == "error":
                    work.on_error(result.get("error_msg"))

            elif result.get("status") == "error":
                err_msg = str(result.get("error_msg", ""))
                console.print(f"[bold red][WORKER](ERROR) : {err_msg}")

                if "503" in err_msg or "502" in err_msg:
                    if work.attempts < work.max_retries:
                        work.attempts += 1
                        console.print(
                            f"[yellow]⚠ 503 Overload. Re-queueing task "
                            f"(Attempt {work.attempts}/{work.max_retries}) "
                        )
                        ND_queue.addBackgroundTask(priority=10, work=work)
                    else:
                        console.print(
                            f"[red]✗ Task exhausted {work.max_retries} retries.[/red]"
                        )

            time.sleep(2)

        except queue.Empty:
            console.print(
                f"[bold red][WORKER][Musicbrainz](ERR) The queue is empty for {timeout}sec. Exiting "
            )
            break
