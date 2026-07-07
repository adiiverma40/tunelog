# This file contains queues for the workers





import asyncio
import itertools


class ListenbrainzQueue:
    work : dict
    def __init__(self) -> None:
        self.lbQueue = asyncio.PriorityQueue()
        self.counter = itertools.count()
        
    async def addWork(self , priority , work):
        await self.lbQueue.put((priority,next(self.counter),  work))
        # print(f"work : {work} added to the queue with priorty : {priority}")
        # print(self.lbQueue)
        
    async def getWork(self):
        _, _, work = await self.lbQueue.get()
        return work 

    def size(self):
        return self.lbQueue.qsize()
    
    
    
    pass


class MusicbrainzQueue:
    pass


class ItunesQueue:
    pass



LB_queue = ListenbrainzQueue()

async def asdfasd(): 
    await LB_queue.addWork(1, {"fetch" : "1"})
    await LB_queue.addWork(1, {"fetch" : "1"})
    await LB_queue.addWork(1, {"fetch" : "1"})
    await LB_queue.addWork(0, {"fetch" : "THis should be printed asdfadsfd"})
    await LB_queue.addWork(0, {"fetch" : "0"})
    await LB_queue.addWork(2, {"fetch" : "2"})

    for i in range(LB_queue.size()) : 
        work = await LB_queue.getWork()
        print(work)


# await asdasd = asdfasd()
# 

asyncio.run(asdfasd())