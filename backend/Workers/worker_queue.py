# This file contains queues for the workers

import itertools
from queue import PriorityQueue, Queue
from typing import Any, Callable, Generic, Optional, TypeVar

from pydantic import BaseModel


class BaseWork(BaseModel):
    response_queue: Any = None
    on_success: Optional[Callable] = None
    max_retries : int = 3
    attempts : int = 0 


class lbWork(BaseWork):
    method: str  # GET/POST
    endpoint: str
    params: Optional[dict] = None
    username: Optional[str] = None
    token: Optional[str] = None


class MBWork(lbWork):
    on_error: Optional[Callable] = None
    pass


class ItunesWork(BaseWork):
    pass


WorkModel = TypeVar("WorkModel", bound=BaseWork)


class BaseQueue(Generic[WorkModel]):
    def __init__(self) -> None:
        self.BaseQueue = PriorityQueue()
        self.counter = itertools.count()

    def addWork(self, work: WorkModel):
        # A queue where the response needed imdediately, Default priority = 0
        return_queue = Queue()
        work.response_queue = return_queue
        self.BaseQueue.put_nowait((0, next(self.counter), work))
        self.printQueue()
        result = return_queue.get()
        return result

    def addBackgroundTask(self, priority, work: lbWork):
        # Make sure the priority is not 0
        if priority == 0:
            priority += 1
        self.BaseQueue.put_nowait((priority, next(self.counter), work))
        print("Background Task Added")
        self.printQueue()
        # self.printQueue()

    def getWork(self, timeout=None):
        if timeout is not None:
            _, _, work = self.BaseQueue.get(timeout=timeout)
        else:
            _, _, work = self.BaseQueue.get()
        return work

    def size(self):
        return self.BaseQueue.qsize()

    def printQueue(self):
        print(list(self.BaseQueue.queue))


class ListenbrainzQueue(BaseQueue[lbWork]):
    pass


LB_queue = ListenbrainzQueue()


class MusicBrainzQueue(BaseQueue[MBWork]):
    pass


MB_queue = MusicBrainzQueue()


class ItunesQueue(BaseQueue[ItunesWork]):
    pass
