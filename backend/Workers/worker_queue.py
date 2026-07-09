# This file contains queues for the workers

import itertools
from queue import PriorityQueue, Queue
from typing import Any, Optional

from pydantic import BaseModel


class lbWork(BaseModel):
    method: str         # GET/POST
    endpoint: str
    params : Optional[dict] = None
    username: Optional[str] = None
    token : Optional[str] = None
    after: Optional[int] = None
    response_queue: Any = None


class ListenbrainzQueue:
    def __init__(self) -> None:
        self.lbQueue = PriorityQueue()
        self.counter = itertools.count()

    def addWork(self, priority, work: lbWork):
        return_queue = Queue()
        work.response_queue = return_queue
        self.lbQueue.put_nowait((priority, next(self.counter), work))
        result = return_queue.get()

        return result

    def getWork(self):
        _, _, work = self.lbQueue.get()
        return work

    def size(self):
        return self.lbQueue.qsize()


LB_queue = ListenbrainzQueue()


class MusicbrainzQueue:
    pass


class ItunesQueue:
    pass
