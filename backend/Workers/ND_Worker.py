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


def method_get(work, session):
    url = f"{ND_BASE}/{work.endpoint.lstrip('/')}"

    try:
        r = session.get(
            url,
            params=work.params,
            headers=get_authed_headers(work.token),
            timeout=15,
        )

        if not r.ok:
            try:
                err_data = r.json()
                nd_msg = err_data.get("error", r.reason)
            except Exception:
                nd_msg = r.reason
            return {
                "status": "error",
                "error_msg": f"{r.status_code} API Error: {nd_msg}",
            }

        content_type = r.headers.get("Content-Type", "")

        if content_type.startswith("image/"):
            result = {
                "status": "success",
                "data": r.content,
                "content_type": content_type,
            }
        else:
            result = {"status": "success", "data": r.json()}

    except requests.exceptions.RequestException as e:
        console.print(f"[bold red]\\[Worker] Network/Connection Error: {e}[/bold red]")
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

        if not r.ok:
            try:
                err_data = r.json()
                nd_msg = err_data.get("error", r.reason)
            except Exception:
                nd_msg = r.reason
            return {
                "status": "error",
                "error_msg": f"{r.status_code} API Error: {nd_msg}",
            }

        result = {"status": "success", "data": r.json()}

    except requests.exceptions.RequestException as e:
        console.print(f"[bold red]\\[Worker] Network/Connection Error: {e}[/bold red]")
        result = {"status": "error", "error_msg": str(e)}

    return result


def method_delete(work, session):
    url = f"{ND_BASE}/{work.endpoint.lstrip('/')}"

    try:
        r = session.delete(
            url,
            json=work.params,
            headers=get_authed_headers(work.token),
            timeout=15,
        )

        if not r.ok:
            try:
                err_data = r.json()
                nd_msg = err_data.get("error", r.reason)
            except Exception:
                nd_msg = r.reason
            return {
                "status": "error",
                "error_msg": f"{r.status_code} API Error: {nd_msg}",
            }

        result = {"status": "success", "data": r.json()}

    except requests.exceptions.RequestException as e:
        console.print(f"[bold red]\\[Worker] Network/Connection Error: {e}[/bold red]")
        result = {"status": "error", "error_msg": str(e)}

    return result


def ND_Worker():
    console.print("[bold blue]\\[WORKER]\\[NAVIDROME] Starting Worker[/bold blue]")
    session = requests.Session()
    timeout = 600
    while True:
        try:
            work = ND_queue.getWork(timeout=timeout)
            result = None
            # print(f"Working on: {work}")

            if work.method.lower() == "get":
                result = method_get(work, session)

            elif work.method.lower() == "post":
                result = method_post(work, session)

            elif work.method.lower() == "delete":
                result = method_delete(work, session)

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

            elif result.get("status") == "error":
                if work.response_queue:
                    work.response_queue.put(result)

                elif work.on_error:
                    work.on_error(result.get("error_msg"))

                err_msg = str(result.get("error_msg", ""))
                console.print(f"[bold red]\\[WORKER]\\[ERROR] {err_msg}[/bold red]")

                if "503" in err_msg or "502" in err_msg:
                    if work.attempts < work.max_retries:
                        work.attempts += 1
                        console.print(
                            f"[yellow]\\[WORKER] 503 Overload. Re-queueing task "
                            f"(Attempt {work.attempts}/{work.max_retries})[/yellow]"
                        )
                        ND_queue.addBackgroundTask(priority=10, work=work)
                    else:
                        console.print(
                            f"[red]\\[WORKER] Task exhausted {work.max_retries} retries.[/red]"
                        )

            time.sleep(0.1)

        except queue.Empty:
            console.print(
                f"[bold red]\\[WORKER]\\[NAVIDROME] The queue is empty for {timeout}sec. Exiting[/bold red]"
            )
            break
