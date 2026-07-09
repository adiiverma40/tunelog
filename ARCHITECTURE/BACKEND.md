# WORKERS

The idea of worker is to create a centrerlized queue and then a worker in which the worker gets the work from queue and then process it and return the data

### Algo 

The Idea is to use the `Queue.priortyQueue` to create a priorty queue, and Assign 0 For heighest, 1 for normal And 2 for low priorty task for the workers. For Now I havent Implemented the Priority as there is no serverice that needs data imideatly


Every worker will have a dedicated class for the queue. Why? 'Cause I wanted to practice OOPS. 

```python

class ListenbrainzQueue:
    def __init__(self) -> None:
        self.lbQueue = PriorityQueue()
        self.counter = itertools.count()

    def addWork(self, priority, work: lbWork):
        return_queue = Queue()
        work.response_queue = return_queue
        self.lbQueue.put_nowait((priority, next(self.counter), work))
        print("work added")
        result = return_queue.get()

        return result

    def getWork(self):
        _, _, work = self.lbQueue.get()
        return work

    def size(self):
        return self.lbQueue.qsize()


LB_queue = ListenbrainzQueue()

```
### Explanation:

Here A shared Object `LB_queue` gets shared accross the `Producer` And `Consumer`. When Producer Adds a Queue, It creates a temp queue using `queue` Module, Using the pointer of the object. When the `Worker` Proccess the task it `PUT` Response in that Queue. And then That Queue Dilivers the response to the producer and Closing the loop

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

```python
class lbWork(BaseModel):
    method: str         # GET/POST
    endpoint: str
    params : Optional[dict] = None
    username: Optional[str] = None
    token : Optional[str] = None
    after: Optional[int] = None
    response_queue: Any = None


```

Using BaseModel to confine the Incomming data, I created 1st prototype of the worker


```python

def func_A():
    print("1st function adding work")
    result = LB_queue.addWork(1, lbWork(type="work 1"))

    print("1st work done ", result)


def func_B():
    print("2nd function adding work")
    result = LB_queue.addWork(1, lbWork(type="work 2"))

    print("2nd work done ", result)


def worker():
    print("in worker")
    size = LB_queue.size()
    # for i in range(size):
    while True:
        time.sleep(1)
        work = LB_queue.getWork()
        print("working on ", work)
        time.sleep(2)
        if work.response_queue:
            work.response_queue.put(f"SUCCESSFUL DATA FOR {work.type}")
```

> For A quick Explaination : A producer creates a Task using the shared object, then that func creates a temp queue. when the worker process the data it puts back the response in the temp Queue. Using that it delivers the data to the producer

