# Manager for the Worker threads
#
# I THOUGHT THE NAME WAS COOL, I AM YOUNG. ITS MY 8th GRADE SYNDROME.
# IMAGINE THIS WORKER FOLDER AS A SHIP SAILING THE HIGH SEAS

import threading
import time
from Workers.LB_Worker import LB_Worker
from Workers.MB_Worker import MB_Worker
from Workers.worker_queue import LB_queue, MB_queue


class luffy:  # Class for the worker manager

    def __init__(self) -> None:  # Zoro
        self.LB = threading.Thread(target=LB_Worker, daemon=True)
        self.MB = threading.Thread(target=MB_Worker, daemon=True)

    def Namy(self, worker=None):  # wakes every worker
        if worker is None:
                    self.LB.start()
                    self.MB.start()
        elif worker == "LB":
            self.LB = threading.Thread(target=LB_Worker, daemon=True)
            self.LB.start()
        elif worker == "MB":
            self.MB = threading.Thread(target=MB_Worker, daemon=True)
            self.MB.start()

    def Robin(self):  # Monitors who is up
        self.Namy()
        while True:
            if LB_queue.size() != 0 and not self.LB.is_alive():
                self.Namy("LB")
                
            if MB_queue.size() != 0 and not self.MB.is_alive():
                self.Namy("MB")

            time.sleep(2)


Sanji = luffy()  # Our COOK
