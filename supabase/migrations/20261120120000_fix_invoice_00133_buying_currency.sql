-- INV/TSW/2026/00133 was entered as USD 4,200 per container before the
-- internal snapshot field consistently stored AED. Normalize that historical
-- value so the USD editor continues to display 4,200.00 after conversion.
update public.invoice_line_profit_details as details
set buying_cost_per_container_aed = round(details.buying_cost_per_container_aed * 3.685, 2)
from public.invoices as invoice
where invoice.id = details.invoice_id
  and invoice.invoice_number = 'INV/TSW/2026/00133'
  and details.buying_cost_per_container_aed = 4200.00;
