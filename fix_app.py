import re

with open('docs/app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    
    # Fix Toasts
    if 'typeof bootstrap !== \\'undefined\\' && bootstrap.Toast' in line:
        # It's a block
        pass
        
    # Fix Modals Show
    if 'const modal = new bootstrap.Modal(document.getElementById(' in line:
        match = re.search(r"document\.getElementById\('([^']+)'\)", line)
        if match:
            modal_id = match.group(1)
            new_lines.append(f"    document.getElementById('{modal_id}').classList.remove('hidden');\n")
            # skip the next line if it is modal.show()
            if i + 1 < len(lines) and 'modal.show()' in lines[i+1]:
                i += 1
            i += 1
            continue
            
    # Fix Modals Hide
    if 'const modal = bootstrap.Modal.getInstance(' in line:
        match = re.search(r"document\.getElementById\('([^']+)'\)", line)
        modal_id = None
        if match:
            modal_id = match.group(1)
        elif 'modalEl' in line:
            modal_id = 'adminPinModal' # specific fix
            
        if modal_id:
            new_lines.append(f"    document.getElementById('{modal_id}').classList.add('hidden');\n")
            # skip the next line if it is modal.hide()
            if i + 1 < len(lines) and 'modal.hide()' in lines[i+1] or 'if (modal) modal.hide()' in lines[i+1]:
                i += 1
            i += 1
            continue
            
    new_lines.append(line)
    i += 1

with open('docs/app.js', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
