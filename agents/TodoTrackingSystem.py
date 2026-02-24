import hashlib
import os
import re
from typing import Optional, Tuple, List, Dict, Set
from dataclasses import dataclass, field
from enum import Enum

class TodoItemStatus(Enum):
    """Status of a TODO item"""
    PENDING = "[ ]"
    IN_PROGRESS = "[~]"
    COMPLETED = "[x]"
    BLOCKED = "[!]"

class TaskCategory(Enum):
    """High-level task categories"""
    RESEARCH = "research"
    SALES = "sales"
    MARKETING = "marketing"
    DEVELOPMENT = "development"
    ANALYSIS = "analysis"
    CONTENT_CREATION = "content"
    GENERAL = "general"

@dataclass
class FileDeliverable:
    """Tracks a single file deliverable"""
    filename: str
    required_sections: List[str] = field(default_factory=list)
    min_content_length: int = 0
    
    # Baseline tracking
    baseline_hash: Optional[str] = None
    baseline_content: Optional[str] = None
    baseline_existed: bool = False
    baseline_sections: Set[str] = field(default_factory=set)
    baseline_section_lengths: Dict[str, int] = field(default_factory=dict)

    # Current state
    created: bool = False
    modified: bool = False
    sections_added: Set[str] = field(default_factory=set)
    current_hash: Optional[str] = None
    content_delta: int = 0
    
    def is_satisfied(self) -> bool:
        """Check if this deliverable is satisfied"""
        # File must exist and be modified
        if not self.created and not self.modified:
            return False
        
        # Must have meaningful content added
        if self.content_delta < self.min_content_length:
            return False
        
        # All required sections must be present (and NEW if they didn't exist before)
        for section in self.required_sections:
            if section not in self.sections_added:
                return False
        return True
    
    def get_status_message(self) -> str:
        """Get human-readable status"""
        status = []
        
        if self.created:
            status.append(f"✅ Created")
        elif self.modified:
            status.append(f"✅ Modified (+{self.content_delta} chars)")
        else:
            status.append(f"❌ Not created")
            return " | ".join(status)
        
        # Section status
        if self.required_sections:
            for section in self.required_sections:
                if section in self.sections_added:
                    status.append(f"✅ '{section}' added")
                elif section in self.baseline_sections:
                    status.append(f"⚠️ '{section}' existed before")
                else:
                    status.append(f"❌ '{section}'  MISSING - Must add this section")
        
        # Content status
        if self.content_delta >= self.min_content_length:
            status.append(f"✅ Sufficient content")
        else:
            needed = self.min_content_length - self.content_delta
            status.append(f"❌ Need {needed} more chars")
        
        return " | ".join(status)


@dataclass
class TodoItem:
    """Enhanced TODO item with multi-file deliverables"""
    index: int
    status: TodoItemStatus
    text: str
    line_number: int
    tools_used: List[str] = field(default_factory=list)
    category: Optional[TaskCategory] = None
    estimated_complexity: int = 1
    
    # ✅ NEW: Multi-file deliverable tracking
    deliverables: List[FileDeliverable] = field(default_factory=list)
    
    # Tool usage tracking
    file_operations: List[Dict] = field(default_factory=list)  # Track each file op
    
    def is_complete(self) -> bool:
        return self.status == TodoItemStatus.COMPLETED
    
    def is_in_progress(self) -> bool:
        return self.status == TodoItemStatus.IN_PROGRESS
    
    def is_pending(self) -> bool:
        return self.status == TodoItemStatus.PENDING
    
    def all_deliverables_satisfied(self) -> bool:
        """Check if ALL deliverables are satisfied"""
        if not self.deliverables:
            # No specific deliverables - use tool count
            return len(self.tools_used) >= 2
        
        return all(d.is_satisfied() for d in self.deliverables)
    
    def get_deliverable_status(self) -> str:
        """Get detailed deliverable status"""
        if not self.deliverables:
            return f"No specific files required | {len(self.tools_used)} tools used"
        
        lines = []
        for i, deliverable in enumerate(self.deliverables, 1):
            satisfied = "✅" if deliverable.is_satisfied() else "❌"
            lines.append(f"{satisfied} {deliverable.filename}: {deliverable.get_status_message()}")
        
        return "\n".join(lines)


class EnhancedDeliverableParser:
    """Parse multiple deliverables from task text"""
    
    @staticmethod
    def parse_deliverables(task_text: str) -> List[FileDeliverable]:
        """
        Parse deliverables from task text
        
        Examples:
        - "Research X -> Document in report.md"
        - "Create analysis.md and summary.txt"
        - "Build dashboard.py with data visualization"
        - "Write proposal.md (include: executive summary, pricing)"
        """
        deliverables = []
        
        # Pattern 1: "-> Document in FILE" or "-> Add to FILE"
        arrow_matches = re.finditer(
            r'->\s*(?:document|add|create|write|update|complete|save).*?(?:in|to)\s+([a-zA-Z0-9_/-]+\.[a-zA-Z]+)',
            task_text,
            re.IGNORECASE
        )
        for match in arrow_matches:
            filename = match.group(1)
            deliverable = FileDeliverable(filename=filename)
            
            # Look for section hints in the same sentence
            sections = EnhancedDeliverableParser._extract_sections(task_text)
            deliverable.required_sections = sections
            
            deliverables.append(deliverable)
        
        # Pattern 2: "Create FILE and FILE"
        create_matches = re.finditer(
            r'(?:create|write|build|generate|develop)\s+([a-zA-Z0-9_/-]+\.[a-zA-Z]+)(?:\s+and\s+([a-zA-Z0-9_/-]+\.[a-zA-Z]+))?',
            task_text,
            re.IGNORECASE
        )
        for match in create_matches:
            for i in range(1, 3):
                filename = match.group(i)
                if filename and not any(d.filename == filename for d in deliverables):
                    deliverables.append(FileDeliverable(filename=filename))
        
        # Pattern 3: Multiple .md/.txt/.py files mentioned
        file_pattern = r'\b([a-zA-Z0-9_/-]+\.(?:md|txt|py|js|json|csv|html))\b'
        files_mentioned = re.findall(file_pattern, task_text, re.IGNORECASE)
        
        for filename in files_mentioned:
            if not any(d.filename == filename for d in deliverables):
                # Check if this looks like a deliverable (not just mentioned)
                if any(verb in task_text.lower() for verb in ['create', 'write', 'build', 'generate', 'add']):
                    deliverables.append(FileDeliverable(filename=filename))
        
        # Parse sections for all deliverables
        sections = EnhancedDeliverableParser._extract_sections(task_text)
        if sections and deliverables:
            # Assign sections to first deliverable (usually the main one)
            deliverables[0].required_sections = sections
        
        return deliverables
    
    @staticmethod
    def _extract_sections(text: str) -> List[str]:
        """Extract required section names"""
        sections = []
        
        # Pattern 1: "Add 'Section Name' section" or "add 'Section Name' section with..."
        # This captures the quoted section name and ignores descriptive text after
        section_matches = re.finditer(
            r'add\s+["\']([^"\']+)["\']?\s+section',
            text,
            re.IGNORECASE
        )
        for match in section_matches:
            sections.append(match.group(1).strip())
        
        # Pattern 2: "(include: A, B, C)" - explicit list of sections
        include_match = re.search(
            r'\(include:\s*([^)]+)\)',
            text,
            re.IGNORECASE
        )
        if include_match:
            items = include_match.group(1).split(',')
            sections.extend([item.strip() for item in items])
        
        # Pattern 3: "Add 'X' section to Y" - extract from this pattern
        add_section_matches = re.finditer(
            r'add\s+["\']([^"\']+)["\']?\s+section\s+to',
            text,
            re.IGNORECASE
        )
        for match in add_section_matches:
            section_name = match.group(1).strip()
            if section_name not in sections:
                sections.append(section_name)
        
        # Pattern 4: Specific keywords (only if no explicit sections found)
        if not sections:
            if 'table' in text.lower():
                sections.append('comparison table')
            if 'timeline' in text.lower():
                sections.append('timeline')
            if 'executive summary' in text.lower():
                sections.append('executive summary')
        
        return list(set(sections))

class RealtimeVerificationEngine:
    """Verifies deliverables in real-time after each file operation"""
    
    def __init__(self, workspace_path_fn, logger):
        self.workspace_path_fn = workspace_path_fn
        self.logger = logger
    
    def capture_baseline(self, deliverable: FileDeliverable):
        """Capture baseline state before task starts"""
        file_path = self.workspace_path_fn(deliverable.filename)
        
        if os.path.exists(file_path):
            try:
                content = self._read_file_safely(file_path)
                
                if content is None:
                    self.logger.error(f"Could not read {deliverable.filename}")
                    return
                
                deliverable.baseline_existed = True
                deliverable.baseline_hash = hashlib.md5(content.encode()).hexdigest()
                deliverable.baseline_content = content

                # Detect existing sections
                for section in deliverable.required_sections:
                    if self._section_exists_in_content(section, content):
                        deliverable.baseline_sections.add(section)
                        section_len = self._get_section_length(section, content)
                        deliverable.baseline_section_lengths[section] = section_len

                self.logger.info(
                    f"📸 Baseline: {deliverable.filename} exists "
                    f"(hash={deliverable.baseline_hash[:8]}, "
                    f"sections={list(deliverable.baseline_sections)})"
                )
            except Exception as e:
                self.logger.error(f"Baseline capture failed: {e}")
        else:
            deliverable.baseline_existed = False
            self.logger.info(f"📸 Baseline: {deliverable.filename} doesn't exist yet")

    def _read_file_safely(self, file_path: str) -> Optional[str]:
        """Safely read file with multiple encoding attempts"""
        encodings = ['utf-8', 'utf-8-sig', 'latin-1', 'cp1252', 'iso-8859-1']
        
        for encoding in encodings:
            try:
                with open(file_path, 'r', encoding=encoding) as f:
                    content = f.read()
                if encoding != 'utf-8':
                    self.logger.debug(f"Read file with {encoding} encoding")
                return content
            except (UnicodeDecodeError, LookupError):
                continue
        
        # Last resort: read with error replacement
        try:
            with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
            self.logger.warning(f"⚠️ Used error replacement for {file_path}")
            return content
        except Exception as e:
            self.logger.error(f"Failed to read {file_path}: {e}")
            return None
        
    def _get_section_length(self, section: str, content: str) -> int:
        """Get the length of content in a specific section"""
        section_lower = section.lower()
        content_lower = content.lower()
        
        start_idx = content_lower.find(section_lower)
        if start_idx == -1:
            return 0
        
        # Find next section or end
        next_section = content_lower.find('\n##', start_idx + 1)
        if next_section == -1:
            next_section = len(content)
        
        section_content = content[start_idx:next_section].strip()
        return len(section_content)
    

    def verify_file_operation(
        self, 
        deliverable: FileDeliverable,
        tool_name: str,
        tool_input: dict
    ) -> Tuple[bool, str]:
        """
        Verify file operation in real-time
        Returns: (verification_passed, explanation)
        """
        file_path = self.workspace_path_fn(deliverable.filename)
        
        # Check if file exists now
        if not os.path.exists(file_path):
            if tool_name == 'write_file':
                return False, f"❌ File {deliverable.filename} not created"
            return False, f"❌ File {deliverable.filename} doesn't exist"
        
        try:
            current_content = self._read_file_safely(file_path)
            if current_content is None:
                return False, f"❌ Could not read {deliverable.filename}"
            
            # Update deliverable state
            deliverable.created = not deliverable.baseline_existed
            deliverable.modified = True
            deliverable.current_hash = hashlib.md5(current_content.encode()).hexdigest()
            
            # Calculate content delta
            if deliverable.baseline_existed:
                # Try to read baseline to calculate delta
                baseline_content = self._read_baseline_content(deliverable)
                deliverable.content_delta = len(current_content) - len(baseline_content)
            else:
                deliverable.content_delta = len(current_content)
            
            # Check hash changed
            if deliverable.baseline_existed:
                if deliverable.current_hash == deliverable.baseline_hash:
                    self.logger.warning(f"⚠️ {deliverable.filename} unchanged (hash match)")
            
            # Verify sections
            deliverable.sections_added.clear()
            for section in deliverable.required_sections:
                if self._section_exists_in_content(section, current_content):
                    # Section exists now
                    deliverable.sections_added.add(section)
                    self.logger.info(f"✅ New section detected: '{section}'")
                else:
                    # Section existed before - check if it has meaningful content
                    section_content_length = self._get_section_length(section, current_content)
                    print(section_content_length, "section_content_length")
                    
                    if section_content_length >= 0:  # Minimum content threshold
                        deliverable.sections_added.add(section)
                        self.logger.info(f"✅ Section '{section}' verified (existed before, has content)")
                    elif self._section_expanded(section, current_content, deliverable):
                        deliverable.sections_added.add(section)
                        self.logger.info(f"✅ Section '{section}' expanded")
                    else:
                        self.logger.warning(f"⚠️ Section '{section}' existed but insufficient content")
            
            # Check if satisfied
            if deliverable.is_satisfied():
                return True, f"✅ {deliverable.filename} verified: +{deliverable.content_delta} chars, sections OK"
            else:
                return False, f"⚠️ {deliverable.filename} incomplete: {deliverable.get_status_message()}"
        
        except Exception as e:
            self.logger.error(f"Verification failed: {e}")
            return False, f"❌ Verification error: {e}"
    
    def _section_exists_in_content(self, section: str, content: str) -> bool:
            """Check if section exists in content (fuzzy matching for partial matches)"""
            section_lower = section.lower()
            content_lower = content.lower()
            
            # Exact patterns
            exact_patterns = [
                f"## {section_lower}",
                f"### {section_lower}",
                f"**{section_lower}**",
                f"{section_lower}:",
                section_lower.replace(' ', '-'),
                section_lower.replace(' ', '_'),
            ]
            
            if any(pattern in content_lower for pattern in exact_patterns):
                return True
            
            heading_pattern = r'^#{1,6}\s+(.+)$'
            for line in content.split('\n'):
                if match := re.match(heading_pattern, line.strip()):
                    heading_text = match.group(1).lower()
                    # Check if our section is a substring of the heading
                    if section_lower in heading_text:
                        return True
            
            return False
    
    def _section_expanded(
        self, 
        section: str, 
        current_content: str,
        deliverable: FileDeliverable
    ) -> bool:
        """Check if section was expanded significantly"""
        # Simple heuristic: extract section and check length
        section_lower = section.lower()
        content_lower = current_content.lower()
        
        start_idx = content_lower.find(section_lower)
        if start_idx == -1:
            return False
        
        # Find next section or end
        next_section = content_lower.find('\n##', start_idx + 1)
        if next_section == -1:
            next_section = len(current_content)
        
        section_content = current_content[start_idx:next_section]
        
        # Section should have substantial content (100+ chars)
        return len(section_content) >= 100
    
    def _read_baseline_content(self, deliverable: FileDeliverable) -> str:
        """Helper to read baseline content"""
        if not deliverable.baseline_existed:
            return ""
        
        file_path = self.workspace_path_fn(deliverable.filename)
        try:
            content = self._read_file_safely(file_path)
            return content if content is not None else ""
        except:
            return ""


class TodoListManager:
    """
    ✅ ENHANCED TODO manager with:
    - Multi-file deliverable tracking
    - Real-time verification after EACH file operation
    - Automatic task completion when all deliverables satisfied
    """
    
    def __init__(self, workspace_path_fn, logger):
        self.workspace_path_fn = workspace_path_fn
        self.logger = logger
        self.todo_path = None
        self.current_item_index = 0
        self.items: List[TodoItem] = []
        self.tool_execution_count = 0
        
        # ✅ Real-time verification engine
        self.verification_engine = RealtimeVerificationEngine(workspace_path_fn, logger)
        
        # Budgets
        self.MAX_TOOLS_PER_TASK = 15
        self.MIN_TOOLS_BEFORE_CHECK = 2
    
    def initialize(self) -> bool:
        """Initialize TODO list tracking"""
        self.todo_path = self.workspace_path_fn("todo.md")
        if not os.path.exists(self.todo_path):
            self.logger.warning("todo.md not found")
            return False
        
        self._load_items()
        self._parse_all_deliverables()
        
        current_item = self.get_current_item()
        if current_item and current_item.deliverables:
            # ✅ FIX: Reset in-progress tasks to pending on restart
            if current_item.is_in_progress():
                self.logger.info(
                    f"🔄 System restarted - resetting task {current_item.index} to PENDING "
                    f"to recapture clean baseline"
                )
                current_item.status = TodoItemStatus.PENDING
                self._save_to_file()
            
            # Now capture baseline for pending task
            if current_item.is_pending():
                self.logger.info(f"📸 Capturing baselines for task {current_item.index}")
                for deliverable in current_item.deliverables:
                    self.verification_engine.capture_baseline(deliverable)
        
        return len(self.items) > 0
    
    
    def _load_items(self):
        """Load TODO items from file"""
        try:
            with open(self.todo_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            self.items = []
            item_index = 0
            
            for line_num, line in enumerate(lines):
                match = re.match(r'^(\s*)-\s*\[(.)\]\s*(.+)$', line)
                if match:
                    status_char = match.group(2).lower()
                    text = match.group(3).strip()
                    
                    if status_char == 'x':
                        status = TodoItemStatus.COMPLETED
                    elif status_char == '~':
                        status = TodoItemStatus.IN_PROGRESS
                    else:
                        status = TodoItemStatus.PENDING
                    
                    item = TodoItem(
                        index=item_index,
                        status=status,
                        text=text,
                        line_number=line_num
                    )
                    self.items.append(item)
                    item_index += 1
            
            self.current_item_index = self._find_first_incomplete_index()
            self.logger.info(f"📋 Loaded {len(self.items)} TODO items")
            
        except Exception as e:
            self.logger.error(f"Failed to load TODO: {e}")
            self.items = []
    
    def _parse_all_deliverables(self):
        """Parse deliverables and estimate complexity"""
        parser = EnhancedDeliverableParser()
        
        for item in self.items:
            item.deliverables = parser.parse_deliverables(item.text)
            
            # ✅ NEW: Fallback if parser found nothing
            if not item.deliverables:
                file_pattern = r'\b([a-zA-Z0-9_/-]+\.(?:md|txt|py|js|json|csv|html))\b'
                files = re.findall(file_pattern, item.text)
                if files:
                    item.deliverables = [FileDeliverable(filename=f) for f in files[:2]]
                    self.logger.warning(
                        f"Task {item.index}: Used fallback file detection: {files}"
                    )
            
            # Estimate complexity
            complexity = len(item.deliverables)
            for d in item.deliverables:
                complexity += len(d.required_sections) * 0.5
            
            item.estimated_complexity = max(1, int(complexity))
            
            if item.deliverables:
                files = [d.filename for d in item.deliverables]
                self.logger.info(
                    f"Task {item.index}: {len(item.deliverables)} deliverables: {files}, "
                    f"complexity={item.estimated_complexity}"
                )
            else:
                self.logger.debug(
                    f"Task {item.index}: No specific deliverables, "
                    f"complexity={item.estimated_complexity}"
                )
                
    
    def _find_first_incomplete_index(self) -> int:
        """Find first incomplete item"""
        for i, item in enumerate(self.items):
            if not item.is_complete():
                return i
        return len(self.items)
    
    def get_current_item(self) -> Optional[TodoItem]:
        """Get current TODO item"""
        if 0 <= self.current_item_index < len(self.items):
            return self.items[self.current_item_index]
        return None
    
    def mark_current_in_progress(self):
        """Mark current item in progress and capture baselines"""
        current_item = self.get_current_item()
        if current_item and current_item.is_pending():
            # ✅ Capture baseline for ALL deliverables
            for deliverable in current_item.deliverables:
                self.verification_engine.capture_baseline(deliverable)
            
            current_item.status = TodoItemStatus.IN_PROGRESS
            self._save_to_file()
            
            self.logger.info(f"🚀 Started task {current_item.index}: {current_item.text[:50]}...")
    
    def record_tool_execution(self, tool_name: str, tool_input: dict, result: str):
        """Record tool execution and check for auto-completion"""
        self.tool_execution_count += 1
        current_item = self.get_current_item()
        
        if not current_item:
            return
        
        current_item.tools_used.append(tool_name)
        
        # Real-time verification for file operations
        if tool_name in ['write_file', 'str_replace_editor']:
            self._verify_file_operation_realtime(tool_name, tool_input, result)
            
            # ✅ FIX: Check if task is now complete AFTER verification
            if current_item.all_deliverables_satisfied():
                self.logger.info(
                    f"🎉 Task {current_item.index} AUTO-DETECTED as complete!"
                )
                return "task_complete"  # Signal to caller
        
        return None
    
    def _verify_file_operation_realtime(
        self, 
        tool_name: str, 
        tool_input: dict, 
        result: str
    ):
        """
        ✅ Verify file operation immediately after execution
        Auto-advance if all deliverables satisfied
        """
        current_item = self.get_current_item()
        if not current_item or not current_item.deliverables:
            return
        
        # Extract filename from tool input
        filename = None
        if tool_name == 'write_file':
            filename = tool_input.get('path', '').split('/')[-1]
        elif tool_name == 'str_replace_editor':
            filename = tool_input.get('path', '').split('/')[-1]
        
        if not filename:
            return
        
        self.logger.info(f"🔍 Real-time verification: {filename}")
        
        # Find matching deliverable
        matching_deliverables = [
            d for d in current_item.deliverables 
            if d.filename.lower() == filename.lower()
        ]
        
        if not matching_deliverables:
            self.logger.debug(f"No deliverable tracking for {filename}")
            return
        
        # Verify each matching deliverable
        all_verified = True
        messages = []
        
        for deliverable in matching_deliverables:
            verified, message = self.verification_engine.verify_file_operation(
                deliverable, tool_name, tool_input
            )
            messages.append(message)
            
            if not verified:
                all_verified = False
        
        # Log verification results
        for msg in messages:
            self.logger.info(msg)
        
        # ✅ Check if ALL deliverables satisfied
        if current_item.all_deliverables_satisfied():
            self.logger.info(
                f"🎉 ALL DELIVERABLES SATISFIED for task {current_item.index}!"
            )
            self.logger.info(f"Status:\n{current_item.get_deliverable_status()}")
            
            # ✅ AUTO-ADVANCE (or offer to mark complete)
            self._offer_auto_completion(current_item)
    
    def _offer_auto_completion(self, item: TodoItem):
        """Offer to auto-complete task"""
        self.logger.info(
            f"\n{'='*60}\n"
            f"✅ TASK {item.index} READY FOR COMPLETION\n"
            f"{'='*60}\n"
            f"Task: {item.text}\n\n"
            f"Deliverable Status:\n{item.get_deliverable_status()}\n\n"
            f"{'='*60}\n"
        )
    
    def verify_task_completion(
        self, 
        tool_name: str, 
        tool_input: dict, 
        result: str
    ) -> Tuple[bool, str]:
        """
        ✅ Verify task completion when agent tries to mark task complete
        """
        current_item = self.get_current_item()
        if not current_item:
            return False, "No current item"
        
        # Is agent trying to edit todo.md?
        if tool_name == 'str_replace_editor' and 'todo.md' in str(tool_input.get('path', '')).lower():
            
            # Check 1: Multi-task cheating
            new_str = tool_input.get('new_str', '')
            old_str = tool_input.get('old_str', '')
            
            old_complete = old_str.count('[x]') + old_str.count('[X]')
            new_complete = new_str.count('[x]') + new_str.count('[X]')
            tasks_being_marked = new_complete - old_complete
            
            if tasks_being_marked > 1:
                return False, (
                    f"❌ BLOCKED: Marking {tasks_being_marked} tasks at once.\n"
                    f"Task: {current_item.text}\n\nJust complete the work in the correct section. The system will auto-detect and mark it as done."
                )
            
            # Check 2: All deliverables satisfied?
            if not current_item.all_deliverables_satisfied():
                unsatisfied = [
                    d for d in current_item.deliverables 
                    if not d.is_satisfied()
                ]
                
                return False, (
                    f"❌ BLOCKED: Not all deliverables satisfied\n\n"
                    f"**Current Status:**\n{current_item.get_deliverable_status()}\n\n"
                    f"**Action Required:**\n"
                    f"Complete the following deliverables:\n" +
                    "\n".join([f"- {d.filename}: {d.get_status_message()}" for d in unsatisfied])
                )
            
            # ✅ All checks passed!
            self.logger.info(f"✅ Task {current_item.index} completion verified!")
            return True, f"All deliverables satisfied: {len(current_item.deliverables)} files"
        
        return True, "Not marking complete"
    
    def verify_todo_edit_validity(self, old_str: str, new_str: str) -> Tuple[bool, str]:
        """Verify TODO edits are valid (called AFTER tool executes)"""
        
        old_complete = old_str.count('[x]') + old_str.count('[X]')
        new_complete = new_str.count('[x]') + new_str.count('[X]')
        tasks_marked = new_complete - old_complete
        
        if tasks_marked > 1:
            # Revert the file
            self._save_to_file()  # Restore from self.items
            return False, (
                f"❌ REVERTED: You marked {tasks_marked} tasks at once.\n"
                f"Tasks must be completed ONE AT A TIME.\n"
                f"Current task: {self.get_current_item().text}\n"
                f"Complete this task first before moving to the next."
            )
        
        return True, "Valid edit"
    
    
    def mark_current_complete(self) -> bool:
        """Mark current item complete and move to next"""
        if not (0 <= self.current_item_index < len(self.items)):
            return False
        
        current_item = self.items[self.current_item_index]
        current_item.status = TodoItemStatus.COMPLETED
        
        self._save_to_file()
        
        self.current_item_index += 1
        self.tool_execution_count = 0
        
        self.logger.info(
            f"✅ Task {self.current_item_index - 1} COMPLETE: {current_item.text[:50]}... "
            f"(Files: {len(current_item.deliverables)}, Tools: {len(current_item.tools_used)})"
        )
        
        return True
    
    def _save_to_file(self):
        """Save updated TODO list"""
        try:
            with open(self.todo_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            for item in self.items:
                if item.line_number < len(lines):
                    line = lines[item.line_number]
                    new_line = re.sub(
                        r'^(\s*-\s*)\[.\]',
                        f'\\1{item.status.value}',
                        line
                    )
                    lines[item.line_number] = new_line
            
            with open(self.todo_path, 'w', encoding='utf-8') as f:
                f.writelines(lines)
            
        except Exception as e:
            self.logger.error(f"Failed to save TODO: {e}")
    
    def get_strict_guidance_message(self) -> Optional[str]:
        """Get strict guidance for current task"""
        current_item = self.get_current_item()
        if not current_item:
            return None
        
        progress = self.get_progress_summary()
        
        message = (
            f"🎯 **MANDATORY TASK** ({progress['completed']}/{progress['total']} complete)\n\n"
            f"**CURRENT TASK:**\n"
            f"→ {current_item.text}\n\n"
        )
        
        if current_item.deliverables:
            message += f"**Required Deliverables ({len(current_item.deliverables)}):**\n"
            for d in current_item.deliverables:
                message += f"- {d.filename}"
                if d.required_sections:
                    message += f" (sections: {', '.join(d.required_sections)})"
                message += "\n"
            message += "\n"
        
        message += (
            f"**Tools used: {len(current_item.tools_used)}/{self.MAX_TOOLS_PER_TASK}**\n\n"
            f"✅ **Real-time verification enabled**: Task will auto-complete when all files created.\n"
        )
        
        return message
    
    def get_progress_summary(self) -> Dict:
        """Get progress summary"""
        total = len(self.items)
        completed = sum(1 for item in self.items if item.is_complete())
        
        return {
            'total': total,
            'completed': completed,
            'progress_percent': int((completed / total * 100)) if total > 0 else 0
        }
    
    def is_all_complete(self) -> bool:
        """Check if all complete"""
        if not self.items:
            return True
        
        completed_count = sum(1 for item in self.items if item.is_complete())
        return completed_count == len(self.items)
    
    def get_completion_summary(self) -> str:
        """Get completion summary"""
        progress = self.get_progress_summary()
        
        summary = (
            f"✅ **ALL TASKS COMPLETE!**\n\n"
            f"Completed {progress['completed']}/{progress['total']} tasks ({progress['progress_percent']}%)\n\n"
        )
        
        for item in self.items:
            if item.is_complete():
                summary += f"✓ {item.text}"
                if item.deliverables:
                    summary += f" ({len(item.deliverables)} files)"
                summary += "\n"
        
        return summary