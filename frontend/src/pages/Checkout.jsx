import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../api';

export default function Checkout() {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const [order, setOrder] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const [message, setMessage] = useState('');

    useEffect(() => { fetchOrder(); }, [orderId]);

    useEffect(() => {
        if (!order || order.status !== 'RESERVED') return;
        const timer = setInterval(() => {
            const expiry = new Date(order.expires_at).getTime();
            const diff = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
            setTimeLeft(diff);
            if (diff === 0) { clearInterval(timer); fetchOrder(); }
        }, 1000);
        return () => clearInterval(timer);
    }, [order]);

    const fetchOrder = async () => {
        try {
            const res = await API.get(`/api/orders/${orderId}`);
            setOrder(res.data);
        } catch (err) { console.error(err); }
    };

    const pay = async (outcome) => {
        try {
            const idempotencyKey = crypto.randomUUID();
            await API.post('/api/payments', { orderId, outcome, idempotencyKey });
            setMessage(`Payment: ${outcome}`);
            setTimeout(fetchOrder, 500);
        } catch (err) {
            setMessage('Error: ' + (err.response?.data?.error || err.message));
        }
    };

    if (!order) return <p>Loading...</p>;

    const m = Math.floor(timeLeft / 60);
    const s = timeLeft % 60;

    return (
        <div>
            <h1>💰 Checkout — Order #{order.id}</h1>

            <div className="card">
                <p><strong>Total:</strong> Rs. {order.total}</p>
                <p><strong>Status:</strong> <span className={`status ${order.status.toLowerCase()}`}>{order.status}</span></p>

                {order.status === 'RESERVED' && (
                    <p className="countdown">⏱ Expires in: {m}:{s.toString().padStart(2, '0')}</p>
                )}

                {order.status === 'EXPIRED' && (
                    <p style={{ color: '#ef4444', marginTop: '0.5rem' }}>
                        This order has expired. Please place a new order.
                    </p>
                )}
            </div>

            {order.status === 'RESERVED' && (
                <div className="card">
                    <h3>Simulate Payment</h3>
                    <div className="payment-buttons">
                        <button className="success" onClick={() => pay('success')}>✅ Success</button>
                        <button className="danger" onClick={() => pay('failure')}>❌ Failure</button>
                        <button className="warning" onClick={() => pay('timeout')}>⏱ Timeout</button>
                    </div>
                </div>
            )}

            {message && <p className="card">{message}</p>}

            <div className="card">
                <h3>Items</h3>
                <ul>
                    {order.items?.map((item) => (
                        <li key={item.id}>{item.product_name} × {item.quantity} — Rs. {item.price}</li>
                    ))}
                </ul>
            </div>

            {order.status !== 'PAID' && (
                <button onClick={() => navigate('/pos')}>← Back to POS</button>
            )}
        </div>
    );
}
