import time
from curses import ERR

import requests
from rich.console import Console
from Workers.worker_queue import LB_queue

console = Console()

LB_HEADERS = {
    "User-Agent": "TuneLog/1.0 (https://github.com/adiiverma40/tunelog; adiiverma40@gmail.com)"
}
LB_BASE = "https://api.listenbrainz.org"


def get_authed_headers(decrypted_token: str) -> dict:
    if not decrypted_token:
        return LB_HEADERS
    return {**LB_HEADERS, "Authorization": f"Token {decrypted_token}"}


def method_get(work, session):
    url = f"{LB_BASE}/{work.endpoint.lstrip('/')}"

    try:
        r = session.get(
            url,
            params=work.params,
            headers=get_authed_headers(work.token),
            timeout=15,
        )

        r.raise_for_status()

        headers = r.headers
        remaining = int(headers.get("x-ratelimit-remaining", 1))
        reset_in = int(headers.get("x-ratelimit-reset-in", 0))

        console.print(
            f"[dim]API Call Successful. Remaining requests: {remaining}[/dim]"
        )

        if remaining <= 0:
            console.print(
                f"[bold yellow]Rate limit hit! Sleeping thread for {reset_in} seconds...[/bold yellow]"
            )
            time.sleep(reset_in)
        else:
            time.sleep(0.2)

        result = {"status": "success", "status_code": r.status_code, "data": r.json()}

    except requests.exceptions.HTTPError as e:
        status_code = e.response.status_code if e.response is not None else 500
        console.print(f"[bold red]Worker API HTTP Error ({status_code}): {e}[/bold red]")
        result = {"status": "error", "status_code": status_code, "error_msg": str(e)}

    except requests.exceptions.RequestException as e:
        console.print(f"[bold red]Worker API Network Error: {e}[/bold red]")
        result = {"status": "error", "status_code": 500, "error_msg": str(e)}

    return result

def method_post(work, session):
    url = f"{LB_BASE}/{work.endpoint.lstrip('/')}"

    try:
        r = session.post(
            url,
            json=work.params,
            headers=get_authed_headers(work.token),
            timeout=15,
        )

        r.raise_for_status()

        headers = r.headers
        remaining = int(headers.get("x-ratelimit-remaining", 1))
        reset_in = int(headers.get("x-ratelimit-reset-in", 0))

        console.print(
            f"[dim]API Call Successful. Remaining requests: {remaining}[/dim]"
        )

        if remaining <= 0:
            console.print(
                f"[bold yellow]Rate limit hit! Sleeping thread for {reset_in} seconds...[/bold yellow]"
            )
            time.sleep(reset_in)
        else:
            time.sleep(0.2)

        result = {"status": "success", "data": r.json()}

    except requests.exceptions.RequestException as e:
        console.print(f"[bold red]Worker API Error: {e}[/bold red]")
        result = {"status": "error", "error_msg": str(e)}

    return result


def LB_Worker():
    console.print(
        "[bold blue][WORKER][ListenBrainz] Starting ... Worker, Waiting For Work...[/bold blue]"
    )
    session = requests.Session()
    while True:
        work = LB_queue.getWork(timeout=60)
        result = None

        if work.method.lower() == "get":
            result = method_get(work, session)

        elif work.method.lower() == "post":
            result = method_post(work, session)

        else:
            result = {
                "status": "error",
                "error_msg": f"Unsupported method: {work.method}",
            }

        try:
            if result.get("status") == "success":
                if work.response_queue:
                    work.response_queue.put(result)

                elif work.on_success and result.get("status") == "success":
                    work.on_success()

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
                        LB_queue.addBackgroundTask(priority=10, work=work)
                    else:
                        console.print(
                            f"[red]✗ Task exhausted {work.max_retries} retries.[/red]"
                        )

        except Exception as e:
            console.print(f"[bold red][LB WORKER] (ERR) : {e}")
