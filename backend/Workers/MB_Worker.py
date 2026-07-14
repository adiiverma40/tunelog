import queue
import time

import requests
from rich.console import Console
from Workers.worker_queue import MB_queue

console = Console()

# TODO : After a request fails, add them to there respective queue, only BGQUEUE

MB_BASE = "https://musicbrainz.org/ws/2"
MB_HEADERS = {
    "User-Agent": "TuneLog/1.0 (https://github.com/adiiverma40/tunelog; adiiverma40@gmail.com)",
    "Accept": "application/json",
}


def get_authed_headers(decrypted_token: str) -> dict:
    if not decrypted_token:
        return MB_HEADERS
    return {**MB_HEADERS, "Authorization": f"Token {decrypted_token}"}


def method_get(work, session):
    url = f"{MB_BASE}/{work.endpoint.lstrip('/')}"

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


def method_post(work, session):
    url = f"{MB_BASE}/{work.endpoint.lstrip('/')}"

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


def MB_Worker():
    console.print(
        "[bold blue][WORKER][Musicbrainz]Starting Worker[/bold blue]"
    )
    session = requests.Session()
    timeout = 600
    while True:
        try:
            work = MB_queue.getWork(timeout=timeout)
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
                            MB_queue.addBackgroundTask(priority=10, work=work)
                        else:
                            console.print(
                                f"[red]✗ Task exhausted {work.max_retries} retries.[/red]"
                            )

            time.sleep(0.5)

        except queue.Empty:
            console.print(
                f"[bold red][WORKER][Musicbrainz](ERR) The queue is empty for {timeout}sec. Exiting "
            )
            break
        except Exception as e:
            console.print(f"[bold red][LB WORKER] (ERR) : {e}")
