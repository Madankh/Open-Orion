import asyncio
import time
import json
from datetime import datetime
from fastapi import WebSocket
from deepsearcher.reasoning.agent import ReasoningAgent
from deepsearcher.utils.stream import StreamManager

async def safe_send_with_retry(websocket: WebSocket, data, max_retries: int = 3):
    """Send data to WebSocket with retry mechanism."""
    for attempt in range(max_retries):
        try:
            if isinstance(data, dict):
                await websocket.send_json(data)
            else:
                await websocket.send_text(json.dumps(data))
            
            return True
            
        except Exception as e:
            print(f"Send attempt {attempt + 1} failed: {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(0.5)
            else:
                return False
    
    return False

async def run_deep_search_async_with_timeout_handling(
    websocket: WebSocket, 
    query: str, 
    user_id: str, 
    db_manager,
    max_steps: int = 40
):
    """Deep search with proper timeout handling and progress updates."""
    print(f"Starting deep search with timeout handling")
    user = await db_manager.get_user_by_id(user_id)
    token_limit = user['token_limit']
    

    if token_limit <= 2000:
        await websocket.send_json({
            "type": "error",
            "content": {"message": "Your token limit has been exhausted. Please upgrade your plan or wait for a reset."}
        })
        await websocket.close()
    else:
        search_task = None
        last_progress_time = time.time()
        progress_timeout = 60
        total_timeout = 600
        start_time = time.time()
        
        try:
            await safe_send_with_retry(websocket, {
                "type": "deep_search_progress",
                "content": {
                    "message": "Initializing deep search...",
                    "progress": 0,
                    "timestamp": datetime.utcnow().isoformat()
                }
            })
            
            stream_manager = StreamManager()
            reasoning_agent = ReasoningAgent(
                question=query, 
                stream_event=stream_manager.create_event_message
            )
            
            token_count = 0
            async def handle_reasoning_token(token: str):
                nonlocal token_count, last_progress_time
                token_count += 1
                
                await stream_manager.create_event_message("reasoning", {"reasoning": token})
                
                current_time = time.time()
                if current_time - last_progress_time > progress_timeout:
                    await safe_send_with_retry(websocket, {
                        "type": "deep_search_progress",
                        "content": {
                            "message": f"Processing... Generated {token_count} tokens",
                            "progress": min(50 + (token_count / 1000) * 40, 90),
                            "timestamp": datetime.utcnow().isoformat(),
                            "tokens_generated": token_count
                        }
                    })
                    last_progress_time = current_time
                
                await asyncio.sleep(0)
            
            def handle_token(token):
                return asyncio.create_task(handle_reasoning_token(token))
            
            search_task = asyncio.create_task(
                reasoning_agent.run(on_token=handle_token, is_stream=True)
            )
            
            consecutive_timeouts = 0
            max_consecutive_timeouts = 30
            
            while True:
                current_time = time.time()
                
                if current_time - start_time > total_timeout:
                    print("Total operation timeout exceeded")
                    await safe_send_with_retry(websocket, {
                        "type": "deep_search_timeout",
                        "content": {
                            "message": "Deep search timed out after 10 minutes",
                            "partial_results": True
                        }
                    })
                    break
                
                try:
                    event = await asyncio.wait_for(
                        stream_manager.queue.get(), 
                        timeout=2.0
                    )
                    
                    consecutive_timeouts = 0
                    
                    if event is None:
                        print("Received end event")
                        break
                    
                    await safe_send_with_retry(websocket, event)
                    
                except asyncio.TimeoutError:
                    consecutive_timeouts += 1
                    
                    if search_task.done():
                        print("Search task completed")
                        try:
                            if search_task.exception():
                                error = search_task.exception()
                                print(f"Search failed: {error}")
                                await safe_send_with_retry(websocket, {
                                    "type": "deep_search_error",
                                    "content": {"message": f"Search failed: {str(error)}"}
                                })
                            else:
                                result = search_task.result()
                                print("Search completed successfully")
                                
                                await safe_send_with_retry(websocket, {
                                    "type": "deep_search_complete",
                                    "content": {
                                        "text": result,
                                        "query": query,
                                        "timestamp": datetime.utcnow().isoformat(),
                                        "total_tokens": token_count
                                    }
                                })
                                
                                oldtoken = token_limit
                                new_balance = max(0, oldtoken - 2000)
                                user = await db_manager.update_user_token(user_id, new_balance)
                                
                        except Exception as e:
                            print(f"Error processing search result: {e}")
                        break
                    
                    if consecutive_timeouts >= max_consecutive_timeouts:
                        print(f"Too many consecutive timeouts ({consecutive_timeouts})")
                        await safe_send_with_retry(websocket, {
                            "type": "deep_search_progress",
                            "content": {
                                "message": "Search appears to be taking longer than expected...",
                                "progress": 95,
                                "timestamp": datetime.utcnow().isoformat()
                            }
                        })
                        consecutive_timeouts = 0
                    
                    if consecutive_timeouts % 15 == 0:
                        elapsed = current_time - start_time
                        await safe_send_with_retry(websocket, {
                            "type": "deep_search_progress", 
                            "content": {
                                "message": f"Still processing... ({int(elapsed)}s elapsed)",
                                "progress": min(10 + (elapsed / total_timeout) * 80, 95),
                                "timestamp": datetime.utcnow().isoformat()
                            }
                        })
        
        except Exception as e:
            print(f"Deep search exception: {str(e)}")
            import traceback
            traceback.print_exc()
            
            await safe_send_with_retry(websocket, {
                "type": "deep_search_error",
                "content": {"message": f"Deep search failed: {str(e)}"}
            })
        
        finally:
            print("Deep search cleanup")
            
            if search_task and not search_task.done():
                print("Cancelling search task")
                search_task.cancel()
                try:
                    await asyncio.wait_for(search_task, timeout=10.0)
                except (asyncio.CancelledError, asyncio.TimeoutError):
                    print("Search task cancelled/timed out")
                except Exception as e:
                    print(f"Error during cleanup: {e}")

async def handle_deep_research_message(
    websocket: WebSocket, 
    content: dict, 
    user_id: str, 
    db_manager,
    active_tasks: dict
):
    """Handle deep research message"""
    print("Processing deep research - START")
    
    try:
        if websocket in active_tasks and not active_tasks[websocket].done():
            print("Active task already running")
            await safe_send_with_retry(websocket, {
                "type": "error",
                "content": {"message": "A query is already being processed"}
            })
            return
            
        query = content.get("text", "")
        max_steps = content.get("max_steps", 10)
        
        if not query:
            await safe_send_with_retry(websocket, {
                "type": "error", 
                "content": {"message": "Query is required for deep search"}
            })
            return
        
        print("Creating deep search task")
        task = asyncio.create_task(
            run_deep_search_async_with_timeout_handling(websocket, query, user_id, db_manager, max_steps)
        )
        active_tasks[websocket] = task
        print("Deep search task created and stored")
        
    except Exception as e:
        print(f"Exception in deep_research handler: {str(e)}")
        await safe_send_with_retry(websocket, {
            "type": "error",
            "content": {"message": f"Deep search setup failed: {str(e)}"}
        })