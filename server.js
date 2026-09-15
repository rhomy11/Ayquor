const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = path.join(__dirname, 'database.json');

function loadData() {
    if (fs.existsSync(DB_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            if (!data.inventory) data.inventory = [];
            if (!data.nextInventoryId) data.nextInventoryId = 1;
            return data;
        } catch (err) {}
    }
    return {
        branches: [{ id: 1, name: 'Main Branch' }],
        nextBranchId: 2,
        receipts: [],
        nextReceiptId: 1,
        inventory: [
            { id: 1, branch_id: 1, name: 'أوراق طابعة A4', quantity: 45, price: 6000 },
            { id: 2, branch_id: 1, name: 'قلم جاف', quantity: 100, price: 500 }
        ],
        nextInventoryId: 3
    };
}

let db = loadData();

function saveData() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function requireRole(allowedRoles) {
    return (req, res, next) => {
        const userRole = req.headers['x-role'];
        if (!userRole) return res.status(401).json({ error: 'x-role missing' });
        if (!allowedRoles.includes(userRole)) return res.status(403).json({ error: 'Access denied' });
        next();
    };
}

app.get('/api/branches', (req, res) => res.json({ branches: db.branches }));
app.post('/api/branches', requireRole(['admin']), (req, res) => {
    const newBranch = { id: db.nextBranchId++, name: req.body.name };
    db.branches.push(newBranch);
    saveData();
    res.json({ message: 'Branch added', branch_id: newBranch.id });
});

app.get('/api/receipts', (req, res) => res.json({ receipts: db.receipts }));
app.post('/api/receipts', requireRole(['admin', 'manager']), (req, res) => {
    const { branch_id, amount, description } = req.body;
    if (!db.branches.find(b => b.id === Number(branch_id))) {
        return res.status(404).json({ error: 'Branch not found' });
    }
    const newReceipt = {
        id: db.nextReceiptId++,
        branch_id: Number(branch_id),
        amount: Number(amount),
        description: description || '',
        status: 'Pending',
        date: new Date().toISOString().split('T')[0]
    };
    db.receipts.push(newReceipt);
    saveData();
    res.json({ message: 'Receipt submitted', receipt: newReceipt });
});

app.patch('/api/receipts/:id/status', requireRole(['admin']), (req, res) => {
    const receipt = db.receipts.find(r => r.id === Number(req.params.id));
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
    receipt.status = req.body.status;
    saveData();
    res.json({ message: `Status updated to ${req.body.status}`, receipt });
});

app.get('/api/inventory', (req, res) => res.json({ inventory: db.inventory }));
app.post('/api/inventory', requireRole(['admin', 'manager']), (req, res) => {
    const { branch_id, name, quantity, price } = req.body;
    const newProduct = {
        id: db.nextInventoryId++,
        branch_id: Number(branch_id),
        name,
        quantity: Number(quantity) || 0,
        price: Number(price) || 0
    };
    db.inventory.push(newProduct);
    saveData();
    res.json({ message: 'Product added', product: newProduct });
});

app.get('/api/reports/summary', requireRole(['admin']), (req, res) => {
    const totalApproved = db.receipts.filter(r => r.status === 'Approved' || r.status === 'مقبول').reduce((sum, r) => sum + r.amount, 0);
    const pendingCount = db.receipts.filter(r => r.status === 'Pending' || r.status === 'قيد الانتظار').length;
    const totalVal = db.inventory.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    const totalItems = db.inventory.reduce((sum, item) => sum + item.quantity, 0);

    res.json({
        report: {
            total_branches: db.branches.length,
            total_approved_expenses: totalApproved,
            pending_receipts_count: pendingCount,
            total_inventory_items: totalItems,
            total_inventory_value: totalVal
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
