// UI交互处理
class MarkUI {
    constructor() {
        this.db = new MarkDB();
        this.editor = document.querySelector('.input-area');
        this.historyList = document.querySelector('.history-list');
        this.addButton = document.querySelector('.add-button');
        this.previewPanel = document.querySelector('.markdown-body');
        this.pasteButton = document.querySelector('.paste-button');

        this.copyToClip = document.querySelector("#copyToClip")

        this.init();
    }

    copyToClipboard() {
        // 检查是否有选中的条目
        const activeItem = this.historyList.querySelector('.history-item.active');
        if (!activeItem) {
            return;
        }

        // 创建一个临时的 blob
        const htmlContent = this.previewPanel.innerHTML;
        const blob = new Blob([htmlContent], { type: 'text/html' });
        
        try {
            const clipboardItem = new ClipboardItem({
                'text/html': blob,
                'text/plain': new Blob([this.previewPanel.innerText], { type: 'text/plain' })
            });
            
            navigator.clipboard.write([clipboardItem])
                .then(() => {
                    alert('内容已复制到剪贴板！');
                })
                .catch(err => {
                    console.error('无法复制富文本内容: ', err);
                    // 降级到普通文本复制
                    navigator.clipboard.writeText(this.previewPanel.innerText)
                        .then(() => {
                            alert('内容已复制到剪贴板（纯文本格式）！');
                        })
                        .catch(err => {
                            console.error('无法复制内容: ', err);
                            alert('无法复制内容，请手动复制。');
                        });
                });
        } catch (err) {
            // 如果不支持 ClipboardItem，降级到普通文本复制
            navigator.clipboard.writeText(this.previewPanel.innerText)
                .then(() => {
                    alert('内容已复制到剪贴板（纯文本格式）！');
                })
                .catch(err => {
                    console.error('无法复制内容: ', err);
                    alert('无法复制内容，请手动复制。');
                });
        }
    }

    // 将初始化逻辑移到异步方法中
    async init() {
        await this.db.initPromise;  // 等待数据库初始化完成
        this.bindEvents();
        await this.loadHistory();
    }

    bindEvents() {
        this.copyToClip.addEventListener('click', (e) => {
            this.copyToClipboard()
        })
        // 新建按钮点击事件
        this.addButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.createNewMark();
        });

        // 编辑器内容变化事件
        let timer;
        this.editor.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(async () => {
                // 更新预览
                this.updatePreview();
                
                const activeItem = this.historyList.querySelector('.history-item.active');
                if (!activeItem) {
                    // 如果没有选中的记录，创建新记录
                    const mark = new Mark(this.editor.value);
                    const id = await this.db.add(mark);
                    mark.id = id;
                    
                    const item = this.createHistoryItem(mark);
                    this.historyList.insertAdjacentHTML('afterbegin', item);
                    
                    // 选中新创建的记录
                    const newItem = this.historyList.querySelector(`[data-id="${id}"]`);
                    newItem.classList.add('active');
                } else {
                    // 更新已有记录
                    await this.saveMark();
                }
            }, 500);
        });

        // 删除按钮事件委托
        this.historyList.addEventListener('click', (e) => {
            if (e.target.closest('.delete-button')) {
                const item = e.target.closest('.history-item');
                this.deleteMark(Number(item.dataset.id));
            } else if (e.target.closest('.history-item')) {
                const item = e.target.closest('.history-item');
                this.loadMark(Number(item.dataset.id));
            }
        });

        // 修改粘贴按钮点击事件
        this.pasteButton.addEventListener('click', async () => {
            try {
                // 先让文档获得焦点
                window.focus();
                // 等待一小段时间确保焦点已经切换
                await new Promise(resolve => setTimeout(resolve, 100));
                
                const text = await navigator.clipboard.readText();
                this.editor.value = text;
                this.editor.focus();
                
                // 触发 input 事件以更新预览和保存
                this.editor.dispatchEvent(new Event('input'));
                
                // 隐藏粘贴按钮
                this.pasteButton.parentElement.style.display = 'none';
            } catch (err) {
                // 如果还是失败，提示用户使用快捷键
                console.error('无法访问剪贴板:', err);
                alert('无法访问剪贴板，请尝试使用键盘快捷键 Cmd+V (Mac) 或 Ctrl+V (Windows) 来粘贴内容。');
                this.editor.focus();
            }
        });

        // 监听编辑器内容变化，控制粘贴按钮显示
        this.editor.addEventListener('input', () => {
            this.pasteButton.parentElement.style.display = 
                this.editor.value.trim() === '' ? 'block' : 'none';
        });
    }

    async loadHistory() {
        const marks = await this.db.getAll();
        this.historyList.innerHTML = marks.map(mark => this.createHistoryItem(mark)).join('');
    }

    createHistoryItem(mark) {
        return `
            <li class="history-item" data-id="${mark.id}">
                <div class="history-title"><a href="#${mark.id}">${mark.extractTitle()}</a></div>
                <div class="history-subtitle">${this.formatDate(mark.updatedAt)}</div>
                <button class="delete-button">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M5 2V1h6v1h4v2H1V2h4zm1 13V5h4v10H6zm-3 0V5H2v10h1zm9 0V5h1v10h-1z"/>
                    </svg>
                </button>
            </li>
        `;
    }

    async createNewMark() {
        const mark = new Mark('');
        const id = await this.db.add(mark);
        mark.id = id;
        
        const item = this.createHistoryItem(mark);
        this.historyList.insertAdjacentHTML('afterbegin', item);
        this.editor.value = '';
        
        // 选中新创建的记录
        const newItem = this.historyList.querySelector(`[data-id="${id}"]`);
        newItem.classList.add('active');
        this.editor.focus();
    }

    async saveMark() {
        const content = this.editor.value;
        const activeItem = this.historyList.querySelector('.history-item.active');
        
        if (!activeItem) return;
        
        const id = Number(activeItem.dataset.id);
        const mark = await this.db.get(id);
        
        mark.content = content;
        mark.updatedAt = new Date();
        await this.db.update(mark);
        
        // 更新列表项
        activeItem.querySelector('.history-title').textContent = mark.extractTitle();
        activeItem.querySelector('.history-subtitle').textContent = this.formatDate(mark.updatedAt);
    }

    // Add updatePreview method
    updatePreview() {
        const content = this.editor.value;
        const html = marked.parse(content);
        this.previewPanel.innerHTML = html;
    }

    // Modify loadMark to update preview when loading content
    async loadMark(id) {
        const mark = await this.db.get(id);
        this.editor.value = mark.content;
        this.updatePreview();
        
        // 根据内容控制粘贴按钮显示
        this.pasteButton.parentElement.style.display = 
            this.editor.value.trim() === '' ? 'block' : 'none';
        
        this.historyList.querySelectorAll('.history-item').forEach(item => {
            item.classList.toggle('active', Number(item.dataset.id) === id);
        });
    }

    // Also update createNewMark to clear preview
    async createNewMark() {
        const mark = new Mark('');
        const id = await this.db.add(mark);
        mark.id = id;
        
        const item = this.createHistoryItem(mark);
        this.historyList.insertAdjacentHTML('afterbegin', item);
        this.editor.value = '';
        this.updatePreview();  // Add preview update
        
        const newItem = this.historyList.querySelector(`[data-id="${id}"]`);
        newItem.classList.add('active');
        this.editor.focus();
    }

    async deleteMark(id) {
        await this.db.delete(id);
        const item = this.historyList.querySelector(`[data-id="${id}"]`);
        item.remove();
        
        if (item.classList.contains('active')) {
            this.editor.value = '';
        }
    }

    formatDate(date) {
        return new Date(date).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}
