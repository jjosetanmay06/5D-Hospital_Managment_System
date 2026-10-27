import { useCallback, useEffect, useState } from "react";
import "./MedicinePurchase.css";
const API = "http://localhost:5000/api";

export default function MedicinePurchase() {
  const [medicines, setMedicines] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [selectedItems, setSelectedItems] = useState({});
  const [orders, setOrders] = useState([]);
  const [checkoutOrder, setCheckoutOrder] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [payingId, setPayingId] = useState("");
  const token = localStorage.getItem("token");
  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
    return data;
  }, [token]);

  const refresh = useCallback(async () => {
    try {
      const [medicineData, orderData] = await Promise.all([
        request("/medicines/prescribed"), request("/medicine-orders/me")
      ]);
      setMedicines(Array.isArray(medicineData.medicines) ? medicineData.medicines : []);
      setPrescriptions(Array.isArray(medicineData.prescriptions) ? medicineData.prescriptions : []);
      setOrders(Array.isArray(orderData.orders) ? orderData.orders : []);
    } catch (error) { setMessage(error.message); }
  }, [request]);

  useEffect(() => { refresh(); }, [refresh]);
  const cart = medicines.filter(m => selectedItems[m.id]).map(m => ({
    medicineId: m.id, name: m.name, quantity: quantities[m.id] || 1, price: Number(m.price || 0)
  }));
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  async function createOrder() {
    if (!cart.length) return;
    setLoading(true); setMessage("");
    try {
      const data = await request("/medicine-orders", {
        method: "POST", body: JSON.stringify({ items: cart.map(({ medicineId, quantity }) => ({ medicineId, quantity })) })
      });
      setCheckoutOrder(data.order);
      setMessage("Order created. Complete the simulated payment below.");
      await refresh();
    } catch (error) { setMessage(error.message); }
    finally { setLoading(false); }
  }
  async function payDemo(order) {
    setPayingId(order.id); setMessage("Processing demo payment...");
    try {
      await new Promise(resolve => setTimeout(resolve, 1200));
      const data = await request(`/medicine-orders/${encodeURIComponent(order.id)}/pay-demo`, { method: "POST" });
      setMessage(`${data.message || "Demo payment successful."} Reference: ${data.payment?.reference || "N/A"}`);
      setCheckoutOrder(null); setSelectedItems({}); await refresh();
    } catch (error) { setMessage(error.message); }
    finally { setPayingId(""); }
  }
  return (
    <section className="booking-panel medicine-panel">
      <h2>Medicine Purchase</h2>
      <p className="medicine-demo-note">Demo mode: payments are simulated. No real money is charged.</p>
      <button type="button" className="book-button" onClick={refresh}>Refresh prescriptions</button>
      {message && <p className="booking-message" role="status" aria-live="polite">{message}</p>}
      <h3 className="medicine-subheading">My prescriptions</h3>
      {prescriptions.length === 0 ? <p>No prescription saved by your doctor yet.</p> :
        prescriptions.map(p => (
          <article className="medicine-card" key={p.id}>
            <div><strong>{p.doctorName}</strong>
              <p>Prescribed: {new Date(p.createdAt).toLocaleString()}</p>
              {p.notes && <p>Notes: {p.notes}</p>}
              {p.items.map(item => <p key={item.medicineId}>{item.name} — Dosage: {item.dosage}; Frequency: {item.frequency}; Instructions: {item.instructions}</p>)}
            </div>
          </article>
        ))}
      <h3 className="medicine-subheading">Your prescribed medicines</h3>
      {medicines.length === 0 ? <p>No prescribed medicines available. Ask your doctor to create a prescription.</p> :
        <div className="medicine-list">{medicines.map(m => (
          <article className="medicine-card" key={m.id}>
            <label className="medicine-select">
              <input type="checkbox" checked={Boolean(selectedItems[m.id])}
                onChange={() => setSelectedItems(current => ({ ...current, [m.id]: !current[m.id] }))} />
              <span><strong>{m.name}</strong><small>Dosage: {m.dosage}</small><small>Frequency: {m.frequency}</small><small>Instructions: {m.instructions}</small></span>
            </label>
            <div className="medicine-price"><strong>₹{Number(m.price).toFixed(2)}</strong>
              <label>Qty <input type="number" min="1" max="20" value={quantities[m.id] || 1}
                disabled={!selectedItems[m.id]}
                onChange={event => setQuantities(current => ({ ...current,
                  [m.id]: Math.max(1, Math.min(20, Number(event.target.value) || 1)) }))} /></label>
            </div>
          </article>
        ))}</div>}
      <div className="medicine-total"><span>Selected items: {cart.length}</span><strong>Total: ₹{total.toFixed(2)}</strong></div>
      <button type="button" className="book-button" disabled={loading || !cart.length} onClick={createOrder}>
        {loading ? "Creating order..." : "Proceed to Checkout"}
      </button>
      {checkoutOrder && <div className="demo-checkout"><h3>Checkout</h3>
        <p>Order ID: {checkoutOrder.id}</p>
        <p>Amount: ₹{Number(checkoutOrder.totalAmount).toFixed(2)}</p>
        <p>No real money will be charged.</p>
        <button type="button" className="book-button" disabled={Boolean(payingId)} onClick={() => payDemo(checkoutOrder)}>
          {payingId ? "Processing payment..." : "Pay Now (Demo)"}
        </button>
      </div>}
      <h3 className="medicine-subheading">My medicine orders</h3>
      {orders.length === 0 ? <p>No medicine orders yet.</p> :
        <div className="medicine-list">{orders.map(order => <article className="medicine-card" key={order.id}>
          <div><strong>Order {order.id}</strong><p>Amount: ₹{Number(order.totalAmount).toFixed(2)}</p>
            <small>Status: {order.paymentStatus}</small>
            {order.paymentReference && <p>Transaction reference: {order.paymentReference}</p>}
          </div>
          {order.paymentStatus === "Pending" && <button type="button" className="medicine-pay-button"
            disabled={Boolean(payingId)} onClick={() => payDemo(order)}>
            {payingId === order.id ? "Processing..." : "Pay (Demo)"}
          </button>}
        </article>)}</div>}
    </section>
  );
}
