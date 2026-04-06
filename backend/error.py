
import time
import sys
import threading
from rich.console import Console

from misc import log, setup_logger
from state import status_registry
from main import main

console = Console(log_path=False)

banner = r"""
 88888888888 888     888 888b    888 8888888888 888      .d88888b.   .d8888b.  
    888     888     888 8888b   888 888        888     d88P" "Y88b d88P  Y88b 
    888     888     888 88888b  888 888        888     888     888 888    888 
    888     888     888 888Y88b 888 8888888    888     888     888 888        
    888     888     888 888 Y88b888 888        888     888     888 888  88888 
    888     888     888 888  Y88888 888        888     888     888 888    888 
    888     Y88b. .d88P 888   Y8888 888        888     Y88b. .d88P Y88b  d88P 
    888      "Y88888P"  888    Y888 8888888888 88888888 "Y88888P"   "Y8888P88
"""


def global_thread_handler(args):
    err_msg = str(args.exc_value)
    status_registry.update("main", status="crashed", error=err_msg)
    
    console.print(f"[bold red]CRITICAL THREAD EXCEPTION:[/bold red] {err_msg}")
    log("critical", f"Thread exception: {err_msg}", source="main")

    sys.exit(1)


threading.excepthook = global_thread_handler


def supervisor_loop():
    timeouts = {
        "SSE": 120,  
        "uvicorn": 30, 
        "sync": 300,  
    }

    console.print("[bold cyan]Supervisor Watchdog Active[/bold cyan]")
    log("info", "Supervisor Watchdog Active", source="main")

    while True:
        time.sleep(15)
        current_time = time.time()
        data = status_registry.get_all()

        critical_failure = False

        for name, info in data.items():
            
            if info["status"] in ["init", "idle"]:
                continue

            timeout_limit = timeouts.get(name, 60)  

            if current_time - info["heartbeat"] > timeout_limit:
                console.print(f"[bold red]ALERT:[/bold red] {name} thread is unresponsive (Timeout: {timeout_limit}s)")
                log("warning", f"{name} thread is unresponsive (Timeout: {timeout_limit}s)", source="main")

                if name in ["uvicorn", "SSE", "main"]:
                    critical_failure = True

            if info["status"] == "crashed":
                console.print(f"[bold red]CRASH DETECTED in {name}:[/bold red] {info['error']}")
                log("error", f"CRASH DETECTED in {name}: {info['error']}", source="main")
                
                if name in ["uvicorn", "main"]:
                    critical_failure = True

        if critical_failure:
            console.print("[bold red]Initiating emergency container restart...[/bold red]")
            log("critical", "Initiating emergency container restart due to critical thread failure.", source="main")
            sys.exit(1) 

def onStart():
    setup_logger()
    
    print(banner)
    console.print("[bold blue]Starting TuneLog Services...[/bold blue]")
    log("info", "Starting TuneLog Services...", source="main")

    try:
        main()  
        supervisor_loop()

    except KeyboardInterrupt:
        console.print("[bold yellow]TuneLog gracefully shutting down...[/bold yellow]")
        log("info", "TuneLog gracefully shutting down via KeyboardInterrupt.", source="main")
        sys.exit(0)
    except Exception as e:
        console.print(f"[bold red]Main Startup Failed:[/bold red] {e}")
        log("critical", f"Main Startup Failed: {e}", source="main")
        sys.exit(1)


if __name__ == "__main__":
    onStart()