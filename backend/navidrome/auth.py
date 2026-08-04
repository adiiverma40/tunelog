from core.crypto import decrypt_token
from core.db import get_db_connection_usr
from rich.console import Console
from Workers.worker_queue import ND_queue, NDWork

console = Console()


def fetchAllUser(cursor):
    user = cursor.execute(
        "select username, password from user where password is not null"
    ).fetchall()
    users = [{"username": u[0], "password": u[1]} for u in user]
    return users


# This function checks the credintial provided in .env file and users.db  and  then save it to Database
def checkCred_SaveCred():
    conn = get_db_connection_usr()
    cursor = conn.cursor()
    users = fetchAllUser(cursor)
    user_tupple = []
    try:
        for user in users:
            password = decrypt_token(user["password"])
            console.print(
                f"[bold blue]\\[CRED][checking] credentials : [/bold blue] [bold green]{user['username']}"
            )
            res = ND_queue.addWork(
                NDWork(
                    method="post",
                    endpoint="/auth/login",
                    params={"username": user["username"], "password": password},
                )
            )
            if res.get("status") == "success":
                token = res.get("data", {}).get("token")
                if token:
                    user_tupple.append((token, user["username"]))
                    console.print(
                        f"[bold blue]\\[CRED][Success] credentials : [/bold blue] [bold green]{user['username']}"
                    )
                
                #  Dont need to log error, worker will log it 
            # else:
            #     console.print(
            #         f"[bold blue]\\[CRED] credentials for {user['username']} failed"
            #     )
            #     print(res)
        cursor.executemany(
            "UPDATE user SET ND_token = ? WHERE username = ?",
            user_tupple,
        )
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        console.log(f"[red]Unexpected Error in checkCred_SaveCred:[/red] {e}")
        return None
