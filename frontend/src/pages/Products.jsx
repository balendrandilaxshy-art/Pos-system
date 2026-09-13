import { useEffect, useState } from 'react';
import API from '../api';

export default function Products() {
    const [products, setProducts] = useState([]);
    const [editing, setEditing] = useState(null);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [form, setForm] = useState({
        name: '', description: '', price: '', category: '', stock: ''
    });

    useEffect(() => { fetchProducts(); }, []);

    const fetchProducts = async () => {
        const res = await API.get('/api/products');
        setProducts(res.data);
    };

    const showMessage = (msg) => {
        setMessage(msg);
        setError('');
        setTimeout(() => setMessage(''), 4000);
    };

    const showError = (err) => {
        setError(err);
        setMessage('');
        setTimeout(() => setError(''), 4000);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editing) {
                await API.put(`/api/products/${editing}`, form);
                showMessage(`✅ Product #${editing} updated successfully!`);
            } else {
                const res = await API.post('/api/products', form);
                showMessage(`✅ Product "${res.data.name || 'New Item'}" created successfully!`);
            }
            resetForm();
            fetchProducts();
        } catch (err) {
            showError('Error: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleEdit = (p) => {
        setEditing(p.id);
        setForm({
            name: p.name, description: p.description || '',
            price: p.price, category: p.category || '', stock: p.stock
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this product?')) return;
        try {
            await API.delete(`/api/products/${id}`);
            showMessage(`✅ Product #${id} deleted successfully!`);
            fetchProducts();
        } catch (err) {
            showError('Delete failed: ' + (err.response?.data?.error || err.message));
        }
    };

    const resetForm = () => {
        setEditing(null);
        setForm({ name: '', description: '', price: '', category: '', stock: '' });
    };

    return (
        <div>
            <h1>📦 Product Management</h1>

            {message && <div className="card" style={{ background: '#166534', color: '#bbf7d0', padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: '6px' }}>{message}</div>}
            {error && <div className="card" style={{ background: '#7f1d1d', color: '#fecaca', padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: '6px' }}>{error}</div>}

            <div className="card">
                <h3>{editing ? `Edit Product #${editing}` : '➕ Add New Product'}</h3>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <input placeholder="Name" value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                        <input placeholder="Description" value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })} />
                    </div>
                    <div className="form-group">
                        <input type="number" placeholder="Price" value={form.price}
                            onChange={(e) => setForm({ ...form, price: e.target.value })} required />
                        <input placeholder="Category" value={form.category}
                            onChange={(e) => setForm({ ...form, category: e.target.value })} />
                        <input type="number" placeholder="Stock" value={form.stock}
                            onChange={(e) => setForm({ ...form, stock: e.target.value })} required />
                    </div>
                    <button type="submit" className="primary">
                        {editing ? 'Update Product' : 'Create Product'}
                    </button>
                    {editing && (
                        <button type="button" onClick={resetForm} style={{ marginLeft: '0.5rem' }}>
                            Cancel
                        </button>
                    )}
                </form>
            </div>

            <h3>All Products ({products.length})</h3>
            <table>
                <thead>
                    <tr>
                        <th>ID</th><th>Name</th><th>Category</th><th>Price</th>
                        <th>Stock</th><th>Reserved</th><th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {products.map((p) => (
                        <tr key={p.id}>
                            <td>#{p.id}</td>
                            <td>{p.name}</td>
                            <td>{p.category}</td>
                            <td>Rs. {p.price}</td>
                            <td>{p.stock}</td>
                            <td>{p.reserved_stock}</td>
                            <td>
                                <div className="actions">
                                    <button onClick={() => handleEdit(p)}>Edit</button>
                                    <button className="danger" onClick={() => handleDelete(p.id)}>Delete</button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
