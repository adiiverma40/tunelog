# WORKERS

The idea of worker is to create a centrerlized queue and then a worker in which the worker gets the work from queue and then process it and return the data

### Algo 

The Idea is to use the `Asyncio.priortyQueue` to create a priorty queue, and Assign 0 For heighest, 1 for normal And 2 for low priorty task for the workers.

Every worker will have a dedicated class for the queue. Why? 'Cause I wanted to practice OOPS. 

```python

class ListenbrainzQueue:
    work : dict
    def __init__(self) -> None:
        self.lbQueue = asyncio.PriorityQueue()
        self.counter = itertools.count()
        
    async def addWork(self , priority , work):
        await self.lbQueue.put((priority,next(self.counter),  work))

    async def getWork(self):
        _, _, work = await self.lbQueue.get()
        return work 

    def size(self):
        return self.lbQueue.qsize()
    pass
```

### WHYS?

1. Why object attribute as lbQueue?
- 'Cause if lbQueue made a class Attribute, everytime trying to access it, it will create a new object. Instead when need just import object

2. Why Counter?
- Heapq using comparision and it will give error if both queue are same, Counter made it so every queue is unique


## Listenbrainz

The worker for listenbrainz worker will work with the queue.

Currently listenbrainz does these :
- Fetch LB CF
- Pushes Local Starred songs
- Pings LB to check token and username

Queue will look like :

'''json
{
"type" : "get/post",
"endpoint":"/song/star"
"after":"update db"
}

'''

This is just a basic idea.

I will add a status code or something to the `after`, like 1 for update db, 2 for do nothing, 3, for something something, 

I dont think this is the best idea, but this is what i have right now.