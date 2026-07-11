# This file contains queues for the workers

import itertools
from queue import PriorityQueue, Queue
from typing import Any, Optional , Callable

from pydantic import BaseModel


class lbWork(BaseModel):
    method: str         # GET/POST
    endpoint: str
    params : Optional[dict] = None
    username: Optional[str] = None
    token : Optional[str] = None
    response_queue: Any = None
    on_success : Optional[Callable] = None


class ListenbrainzQueue:
    def __init__(self) -> None:
        self.lbQueue = PriorityQueue()
        self.counter = itertools.count()

    def addWork(self, priority  , work: lbWork):
        # A queue where the response needed imdediately, Default priority = 0 
        return_queue = Queue()
        work.response_queue = return_queue
        self.lbQueue.put_nowait((0 , next(self.counter), work))
        self.printQueue()
        result = return_queue.get()
        return result
    def addBackgroundTask(self , priority , work : lbWork):
        # Make sure the priority is not 0 
        if priority == 0 :
            priority += 1
        self.lbQueue.put_nowait((priority , next(self.counter) , work))
        print("Background Task Added")
        # self.printQueue()

    def getWork(self):
        _, _, work = self.lbQueue.get()
        return work

    def size(self):
        return self.lbQueue.qsize()
        
    def printQueue(self):
        print(list(self.lbQueue.queue))


LB_queue = ListenbrainzQueue()


class MusicbrainzQueue:
    pass


class ItunesQueue:
    pass
