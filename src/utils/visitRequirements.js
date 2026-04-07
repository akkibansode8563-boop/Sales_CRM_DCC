export function createVisitDraft() {
  return {
    customer_id: null,
    customer_name: '',
    contact_person: '',
    contact_phone: '',
    client_type: 'Retailer',
    location: '',
    visit_type: 'Field Visit',
    interaction_type: 'Meeting',
    order_value: '',
    payment_collected: '',
    check_in_time: new Date().toISOString(),
    check_out_time: null,
    distance_from_prev: 0,
    km_covered: 0,
    status: 'Completed',
    notes: '',
    latitude: null,
    longitude: null,
    photo: null,
    voice_note: null,
    follow_up_date: '',
    follow_up_note: '',
  }
}

export function validateVisitDraft(draft) {
  const customerName = (draft.customer_name || draft.client_name || '').trim()
  if (!customerName) return 'Customer name is required'
  if (!(draft.contact_person || '').trim()) return 'Contact person is required'
  if (!(draft.contact_phone || '').trim()) return 'Contact phone is required'
  if (!(draft.client_type || '').trim()) return 'Nature of business is required'
  if (!(draft.location || '').trim()) return 'Address is required'
  if (!draft.interaction_type) return 'Interaction type is required'
  if (!(draft.notes || '').trim()) return 'Visit notes are mandatory for structured logging'
  if (draft.latitude == null || draft.longitude == null) return 'GPS location is compulsory'
  if (!draft.photo) return 'Visit photo is mandatory'
  return ''
}
