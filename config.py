#config file, use for creating url 

from dotenv import load_dotenv
import os

load_dotenv()

Navidrome_url = os.getenv("base_url")
Navidrome_admin = os.getenv("admin_username")
navidrome_password = os.getenv("admin_password")
api_version = "1.16.1"
app_name = "tunelog"


def build_url(endpoint):
    return(
        f"{Navidrome_url}/rest/{endpoint}"
        f"?u={Navidrome_admin}"
        f"&p={navidrome_password}"
        f"&v={api_version}"
        f"&c={app_name}"
        f"&f=json"
        
    )



