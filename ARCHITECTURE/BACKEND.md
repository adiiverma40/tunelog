# WORKERS

The idea of worker is to create a centrerlized queue and then a worker in which the worker gets the work from queue and then process it and return the data

### ALGO

The Idea is to use the `Queue.priortyQueue` to create a priorty queue, and Assign 0 For heighest, 1 for normal And 2 for low priorty task for the workers. For Now I havent Implemented the Priority as there is no serverice that needs data imideatly


Every worker will have a dedicated class for the queue. Why? 'Cause I wanted to practice OOPS. 

```python

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
        self.printQueue()

    def getWork(self):
        _, _, work = self.lbQueue.get()
        return work

    def size(self):
        return self.lbQueue.qsize()
        
    def printQueue(self):
        print(list(self.lbQueue.queue))


LB_queue = ListenbrainzQueue()

```
### Explanation:

Here A shared Object `LB_queue` gets shared accross the `Producer` And `Consumer`. When Producer Adds a Queue, It creates a temp queue using `queue` Module, Using the pointer of the object. When the `Worker` Proccess the task it `PUT` Response in that Queue. And then That Queue Dilivers the response to the producer and Closing the loop



### WHYS?

1. Why object attribute as lbQueue?
- 'Cause if lbQueue made a class Attribute, everytime trying to access it, it will create a new object. Instead when need just import object

2. Why Counter?
- Heapq using comparision and it will give error if both queue are same, Counter made it so every queue is unique

3. Why addBackgroundTask()?
- While addWork is used for the function that needs imideiate response, Background task are for those task that doesnt need imiediate response and can be done in bg without any trouble

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
    response_queue: Any = None
    on_success : Optional[Callable] = None

```

Using BaseModel to confine the Incomming data, I created 1st prototype of the worker.

The on_success is a callable that is used to call a function after a task is done, for now it is used to mark task complete in Push star function
It work by taking a function and then calling it when the task is done 


```python

def LB_Worker():
    console.print(
        "[bold blue][WORKER] Starting Listenbrainz Worker, Waiting For Work...[/bold blue]"
    )
    session = requests.Session()
    while True:
        work = LB_queue.getWork()
        result = None

        if work.method.lower() == "get":
            result = method_get(work, session)

        elif work.method.lower() == "post":
            result = method_post(work, session)

        else:
            result = {
                "status": "error",
                "error_msg": f"Unsupported method: {work.method}",
            }

        try:
            
            if work.response_queue:
                work.response_queue.put(result)

            if work.on_success and result.get("status") == "success":
                work.on_success()

        except Exception as e :
            console.print(f'[bold red][LB WORKER] (ERR) : {e}')
```

> For A quick Explaination : A producer creates a Task using the shared object, then that func creates a temp queue. when the worker process the data it puts back the response in the temp Queue. Using that it delivers the data to the producer
> Here, The function passed by the On_success callable is called when the api returns a success status after an task is done. Usin Try and Except for the error in case a function is passed that doesnt exist

