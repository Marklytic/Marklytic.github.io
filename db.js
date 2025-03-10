// 数据库配置
const DB_NAME = 'mk2wdDB';
const DB_VERSION = 1;
const STORE_NAME = 'marks';

// 数据库初始化
function initDB() {
    
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { 
                    keyPath: 'id',
                    autoIncrement: true 
                });
                store.createIndex('createdAt', 'createdAt');
                store.createIndex('updatedAt', 'updatedAt');
            }
        };
    });
}

// Mark数据模型
class Mark {
    constructor(content, title = '') {
        // Remove this.id = null since it will be auto-generated
        this.title = title;
        this.content = content;
        this.createdAt = new Date();
        this.updatedAt = new Date();
    }

    // 从content中提取标题
    extractTitle() {
        if (this.title) return this.title;
        
        // 从content中提取第一行非空文本作为标题
        const firstLine = this.content
            .split('\n')
            .find(line => line.trim().length > 0);
            
        return firstLine ? 
            firstLine.trim().substring(0, 50) + (firstLine.length > 50 ? '...' : '') : 
            '未命名文档';
    }
}

// 数据操作类
class MarkDB {
    constructor() {
        this.db = null;
        this.initPromise = this.init();
    }



    async init() {
        this.db = await initDB();
    }

    async add(mark) {
        const store = await this.getStore('readwrite');
        return new Promise((resolve, reject) => {
            // Create a new object without the id property
            const { id, ...markData } = mark;
            const request = store.add(markData);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async update(mark) {
        const store = await this.getStore('readwrite');
        return new Promise((resolve, reject) => {
            const request = store.put(mark);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async delete(id) {
        const store = await this.getStore('readwrite');
        return new Promise((resolve, reject) => {
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getAll() {
        const store = await this.getStore('readonly');
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            
            request.onsuccess = () => {
                const marks = request.result.map(data => {
                    const mark = new Mark(data.content, data.title);
                    return Object.assign(mark, data);
                });
                marks.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                resolve(marks);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async get(id) {
        const store = await this.getStore('readonly');
        return new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => {
                const data = request.result;
                if (data) {
                    const mark = new Mark(data.content, data.title);
                    resolve(Object.assign(mark, data));
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getStore(mode) {
        await this.initPromise;
        return this.db
            .transaction(STORE_NAME, mode)
            .objectStore(STORE_NAME);
    }
}