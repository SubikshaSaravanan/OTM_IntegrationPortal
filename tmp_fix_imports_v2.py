import os
import re

def fix_imports():
    # 1. Fix top-level imports (ensure no dots if we are at top level)
    # Actually, we already removed them.
    
    # 2. Fix subfolder sibling imports
    # In item_modules, we need dots for siblings
    item_modules_dir = 'backend/item_modules'
    for file in os.listdir(item_modules_dir):
        if file.endswith('.py'):
            path = os.path.join(item_modules_dir, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Change 'from item_model import' to 'from .item_model import'
            new_content = re.sub(r'from (item_model|item_service) import', r'from .\1 import', content)
            
            if new_content != content:
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"Fixed sibling imports in {path}")

    # 3. Fix any other subfolders if they exist
    # (Checking utils or other dirs)
    for root, dirs, files in os.walk('backend'):
        if root == 'backend' or root == 'backend/item_modules':
            continue
        for file in files:
            if file.endswith('.py'):
                path = os.path.join(root, file)
                # For now, let's just see if there are any sibling imports there
                # Usually we don't have many subfolders
                pass

if __name__ == "__main__":
    fix_imports()
