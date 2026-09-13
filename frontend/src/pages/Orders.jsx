import { useEffect, useState } from 'react';
import API from '../api';

export default function Orders() {
    const [orders, setOrders] = useState([]);
    const [selected, setSelected] = useState(null);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    useEffect(() => { fetchOrders(); }, []);

    const fetchOrders = async () => {
        const res = await API.get('/api/orders');
        setOrders(res.data);
    };

    const viewOrder = async (id) => {
        const res = await API.get(`/api/orders/${id}`);
        setSelected(res.data);
    };

    const cancelOrder = async (id) => {
        if (!window.confirm('Cancel this order?')) return;
        try {
            const res = await API.post(`/api/orders/${id}/cancel`);
            fetchOrders();
            setSelected(null);
            const actionText = res.data?.refunded ? 'refunded' : 'cancelled';
            setMessage(`✅ Order #${id} ${actionText} successfully!`);
            setTimeout(() => setMessage(''), 4000);
        } catch (err) {
            setError('Error: ' + (err.response?.data?.error || err.message));
            setTimeout(() => setError(''), 4000);
        }
    };

    return (
        <div>
            <h1>📋 Order History</h1>
            {message && <div className="card" style={{ background: '#166534', color: '#bbf7d0', padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: '6px' }}>{message}</div>}
            {error && <div className="card" style={{ background: '#7f1d1d', color: '#fecaca', padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: '6px' }}>{error}</div>}
            <table>
                <thead>
                    <tr><th>ID</th><th>Total</th><th>Status</th><th>Created</th><th>Actions</th></tr>
                </thead>
                <tbody>
                    {orders.map((o) => (
                        <tr key={o.id}>
                            <td>#{o.id}</td>
                            <td>Rs. {o.total}</td>
                            <td><span className={`status ${o.status.toLowerCase()}`}>{o.status}</span></td>
                            <td>{new Date(o.created_at).toLocaleString()}</td>
                            <td><button onClick={() => viewOrder(o.id)}>View</button></td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {selected && (
                <div className="card">
                    <h3>Order #{selected.id} Details</h3>
                    <p>Status: <span className={`status ${selected.status.toLowerCase()}`}>{selected.status}</span></p>
                    <ul>
                        {selected.items?.map((item) => (
                            <li key={item.id}>{item.product_name} × {item.quantity} — Rs. {item.price}</li>
                        ))}
                    </ul>
                    {(selected.status === 'PAID' || selected.status === 'RESERVED') && (
                        <button className="danger" onClick={() => cancelOrder(selected.id)}>
                            Cancel / Refund
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
