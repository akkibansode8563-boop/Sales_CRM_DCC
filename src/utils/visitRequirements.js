export function createVisitDraft() {
  return {
    customer_id: null,
    customer_name: '',
    contact_person: '',
    contact_phone: '',
    client_type: 'Retailer',
    location: '',
    visit_type: 'Field Visit',
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
  if (draft.latitude == null || draft.longitude == null) return 'GPS location is compulsory'
  if (!draft.photo) return 'Visit photo is mandatory'
  return ''
}
