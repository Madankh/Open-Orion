from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound, VideoUnavailable
from lab.base import (
    AgentPlugin,
    AgentImplOutput,
)
from typing import Any, Optional
from llm.message_history import MessageHistory
from datetime import datetime, timedelta
import re


class YoutubeTranscriptTool(AgentPlugin):
    name = "youtube_video_transcript"
    description = """This tool retrieves and returns the transcript of a YouTube video with timestamps. It supports both manually created subtitles and automatically generated captions, prioritizing manual subtitles when available.
      It can optionally filter transcript segments by a specified time range.
      When a user provides a YouTube URL along with additional context, this tool enables more accurate understanding and better responses to user questions. Only fetch the transcript once per video per conversation unless a specific time range is needed
      Note: Transcripts are cached to avoid redundant API calls for the same video."""

    input_schema = {
        "type": "object",
        "properties": {
            "url": {
                "type": "string",
                "description": "Youtube Video URL or Video ID",
            },
            "start_time": {
                "type": "number",
                "description": "Start time in seconds (optional). Example: 60 for 1 minute",
            },
            "end_time": {
                "type": "number",
                "description": "End time in seconds (optional). Example: 180 for 3 minutes",
            },
        },
        "required": ["url"],
    }
    output_type = "string"

    def __init__(self):
        super().__init__()
        self._cache = {}  # {video_id: {'segments': list, 'timestamp': datetime}}
        self._cache_ttl = timedelta(hours=1)  # Cache for 1 hour

    def _get_cached_segments(self, video_id: str) -> Optional[list]:
        """Get transcript segments from cache if available and not expired"""
        if video_id in self._cache:
            cached = self._cache[video_id]
            if datetime.now() - cached['timestamp'] < self._cache_ttl:
                return cached['segments']
            else:
                # Remove expired entry
                del self._cache[video_id]
        return None

    def _cache_segments(self, video_id: str, segments: list):
        """Store transcript segments in cache"""
        self._cache[video_id] = {
            'segments': segments,
            'timestamp': datetime.now()
        }

    def extract_video_id(self, url: str) -> str:
        """Extract video ID from various YouTube URL formats"""
        # If it's already just an ID
        if len(url) == 11 and not ('/' in url or '.' in url):
            return url
        
        # Remove timestamp parameter if present
        url = re.sub(r'[&?]t=\d+s?', '', url)
        
        # Extract video ID from various URL formats
        patterns = [
            r'(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})',
            r'youtube\.com\/embed\/([a-zA-Z0-9_-]{11})',
            r'youtube\.com\/v\/([a-zA-Z0-9_-]{11})',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)
        
        return url

    def format_timestamp(self, seconds: float) -> str:
        """Convert seconds to HH:MM:SS or MM:SS format"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        
        if hours > 0:
            return f"{hours:02d}:{minutes:02d}:{secs:02d}"
        else:
            return f"{minutes:02d}:{secs:02d}"

    def _filter_segments(self, segments: list, start_time: Optional[float] = None, end_time: Optional[float] = None) -> tuple[list, dict]:
        """Filter segments by time range and return filtered segments with statistics"""
        filtered_segments = []
        total_segments = len(segments)
        skipped_before = 0
        skipped_after = 0
        
        for segment in segments:
            snippet_start = segment['start']
            snippet_text = segment['text']
            
            # Skip segments before start_time
            if start_time is not None and snippet_start < start_time:
                skipped_before += 1
                continue
            
            # Stop processing segments after end_time
            if end_time is not None and snippet_start > end_time:
                skipped_after += 1
                continue
            
            # Format with timestamp
            timestamp = self.format_timestamp(snippet_start)
            filtered_segments.append(f"[{timestamp}] {snippet_text}")
        
        stats = {
            'total_segments': total_segments,
            'skipped_before': skipped_before,
            'skipped_after': skipped_after,
            'filtered_count': len(filtered_segments)
        }
        
        return filtered_segments, stats

    async def run_impl(
        self,
        tool_input: dict[str, Any],
        message_history: Optional[MessageHistory] = None,
    ) -> AgentImplOutput:
        url = tool_input["url"]
        start_time = tool_input.get("start_time")
        end_time = tool_input.get("end_time")
    
        try:
            video_id = self.extract_video_id(url)
            
            # Check cache first
            cached_segments = self._get_cached_segments(video_id)
            from_cache = False
            
            if cached_segments is not None:
                # Use cached segments
                segments = cached_segments
                from_cache = True
            else:
                # Fetch from API
                ytt_api = YouTubeTranscriptApi()
                transcript_list = ytt_api.fetch(video_id)
                
                # Convert to our internal format
                segments = []
                for snippet in transcript_list.snippets:
                    segments.append({
                        'start': snippet.start,
                        'text': snippet.text.strip()
                    })
                
                # Cache the segments
                self._cache_segments(video_id, segments)
            
            # Filter segments by time range
            filtered_segments, stats = self._filter_segments(segments, start_time, end_time)
            
            if not filtered_segments:
                time_range = ""
                if start_time is not None or end_time is not None:
                    time_range = f" in the specified time range"
                    if start_time is not None:
                        time_range += f" (from {self.format_timestamp(start_time)}"
                    if end_time is not None:
                        if start_time is not None:
                            time_range += f" to {self.format_timestamp(end_time)})"
                        else:
                            time_range += f" (up to {self.format_timestamp(end_time)})"
                    elif start_time is not None:
                        time_range += " onwards)"
                
                msg = f"No transcript segments found{time_range}."
                return AgentImplOutput(
                    msg,  
                    msg,
                    auxiliary_data={
                        "success": False, 
                        "video_id": video_id,
                        "from_cache": from_cache
                    }
                )
            
            result_text = "\n".join(filtered_segments)
            
            # Build summary message
            summary_parts = [f"Successfully retrieved transcript for video {video_id}"]
            if from_cache:
                summary_parts.append("(from cache)")
            if start_time is not None or end_time is not None:
                time_info = []
                if start_time is not None:
                    time_info.append(f"from {self.format_timestamp(start_time)}")
                if end_time is not None:
                    time_info.append(f"to {self.format_timestamp(end_time)}")
                summary_parts.append(f"Time range: {' '.join(time_info)}")
            summary_parts.append(f"Retrieved {len(filtered_segments)} segments")
            
            summary = ". ".join(summary_parts) + "."
            
            return AgentImplOutput(
                result_text,
                summary,
                auxiliary_data={
                    "success": True, 
                    "video_id": video_id,
                    "segments_count": len(filtered_segments),
                    "total_segments": stats['total_segments'],
                    "start_time": start_time,
                    "end_time": end_time,
                    "from_cache": from_cache
                }
            )
    
        except VideoUnavailable:
            msg = f"YouTube video is unavailable (ID: {video_id if 'video_id' in locals() else 'unknown'})."
            return AgentImplOutput(msg, msg, auxiliary_data={"success": False})
        except TranscriptsDisabled:
            msg = f"Transcripts are disabled for this video (ID: {video_id if 'video_id' in locals() else 'unknown'})."
            return AgentImplOutput(msg, msg, auxiliary_data={"success": False})
        except NoTranscriptFound:
            msg = f"No transcript found for this video (ID: {video_id if 'video_id' in locals() else 'unknown'})."
            return AgentImplOutput(msg, msg, auxiliary_data={"success": False})
        except Exception as e:
            msg = f"Error fetching transcript: {str(e)}"
            return AgentImplOutput(msg, msg, auxiliary_data={"success": False})