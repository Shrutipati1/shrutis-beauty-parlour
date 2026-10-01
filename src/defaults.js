'use strict';
/**
 * Default (placeholder) content. Everything here is safe to edit later in the
 * admin dashboard — no real phone numbers, addresses, certifications or
 * genuine reviews are invented.
 */
const IMG = 'https://images.unsplash.com';

const defaultSettings = {
  business_name: "Shruti's Beauty Parlour",
  tagline: 'Your Beauty, Our Passion',
  hero_headline: 'Timeless beauty, tailored to you.',
  hero_subtext:
    'Professional beauty, hair, makeup and bridal services designed to make every occasion special.',
  about_text:
    "Shruti's Beauty Parlour is a warm, welcoming salon focused on personalised beauty, hair, makeup and styling. Every appointment begins with a conversation about what you want and how you want to feel, so we can recommend and deliver the right service in a comfortable, hygienic environment using quality, skin-friendly products. Whether it is an everyday refresh or your once-in-a-lifetime bridal look, our goal is simple: help you leave feeling confident and completely yourself.",
  phone: '',
  whatsapp: '',
  email: '',
  address_line: '',
  city: '',
  maps_embed_url: '',
  instagram_url: '',
  facebook_url: '',
  open_time: '11:00',
  close_time: '18:30',
  slot_interval: 30,
  booking_horizon_days: '60',
  cancellation_notice_hours: '12',
  reminder_24h: '1',
  reminder_2h: '0',
  require_payment_online: '0',
  payment_note: 'Payable at the salon. Please confirm any advance payment directly with us.',
  timezone: 'Asia/Kolkata',
  public_base_url: 'http://localhost:3001',
  salon_closed_note: 'Open Monday to Saturday. Closed on Sundays.',
  disclaimer: 'Prices shown are sample rates and may be updated. Final pricing is confirmed at the salon.'
};

const services = [
  { name: 'Eyebrow Threading', category: 'Threading', price: 50, duration: 15, image: `${IMG}/photo-1526045478516-99145907023c?auto=format&fit=crop&w=900&q=80`, description: 'Gentle, precise threading for a clean, defined brow shape that suits your face.' },
  { name: 'Haircut', category: 'Hair', price: 250, duration: 45, image: `${IMG}/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=900&q=80`, description: 'Consultation, wash, cut and finish — styled to flatter your features and routine.' },
  { name: 'Facial', category: 'Skin Care', price: 700, duration: 60, image: `${IMG}/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=900&q=80`, description: 'Deep-cleansing facial with steam, gentle exfoliation and a hydrating mask.' },
  { name: 'Bleach', category: 'Hair', price: 400, duration: 45, image: `${IMG}/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=900&q=80`, description: 'Gentle root bleach for a refreshed base, with a conditioning treatment included.' },
  { name: 'Waxing', category: 'Waxing', price: 500, duration: 30, image: `${IMG}/photo-1519699047748-de8e457a634e?auto=format&fit=crop&w=900&q=80`, description: 'Full arms and underarms with hygienic, skin-friendly wax for smooth results.' },
  { name: 'Hair Straightening', category: 'Hair', price: 3000, duration: 120, image: `${IMG}/photo-1560869713-7d0a29430803?auto=format&fit=crop&w=900&q=80`, description: 'Smooth, manageable hair with a strand-by-strand keratin-friendly treatment.' },
  { name: 'Makeup', category: 'Makeup', price: 1500, duration: 75, image: `${IMG}/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=900&q=80`, description: 'Party or occasion makeup tailored to your outfit, lighting and comfort level.' },
  { name: 'Bridal Makeup', category: 'Bridal', price: 7000, duration: 180, image: `${IMG}/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=900&q=80`, description: 'Complete pre-bridal to wedding-day artistry with HD finish, lashes and draping support.' },
  { name: 'Hairstyle', category: 'Hairstyling', price: 700, duration: 60, image: `${IMG}/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=900&q=80`, description: 'Elegant updos, waves or braided styles for parties, functions and weddings.' }
];

const faqs = [
  { question: 'How do I book an appointment?', answer: 'Use the Book Appointment button on this website, choose your service, date and available time slot, and you will receive an instant confirmation with a booking ID. Please double-check your contact details before confirming.' },
  { question: 'Can I book multiple services?', answer: 'Yes. Book your first service, then add another appointment for the same or a different day. If you need several services back-to-back, contact us directly so we can reserve consecutive time slots.' },
  { question: 'Can I cancel my appointment?', answer: 'Yes. Open your booking using the link in your confirmation, choose Cancel, and the slot is released immediately. We ask for at least a few hours notice so we can offer the time to someone else.' },
  { question: 'Can I reschedule?', answer: 'Absolutely. Open your booking link and choose Reschedule to pick a new date and time. Your original slot is released as soon as the new one is confirmed.' },
  { question: 'What are the opening hours?', answer: 'We are open Monday to Saturday, 11:00 AM to 6:30 PM. We are closed on Sundays. Public holidays and special timings may apply — please confirm when booking.' },
  { question: 'Do you offer bridal makeup?', answer: 'Yes. We offer complete bridal packages including pre-bridal sessions, wedding-day HD makeup and hairstyling. Early booking is recommended during wedding season.' },
  { question: 'How early should bridal appointments be booked?', answer: 'For wedding season we suggest booking 4 to 8 weeks in advance. We also recommend a pre-bridal trial so we can fine-tune the look to your comfort.' },
  { question: 'Do I need to pay online?', answer: 'No online payment is required. Services are payable at the salon after your appointment, unless you have arranged an advance payment directly with us.' }
];

const gallery = [
  { title: 'Bridal Glow', category: 'Bridal', image_url: `${IMG}/photo-1596178065887-1198b6148b2b?auto=format&fit=crop&w=1100&q=80` },
  { title: 'Signature Haircut', category: 'Hair', image_url: `${IMG}/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1100&q=80` },
  { title: 'Evening Makeup', category: 'Makeup', image_url: `${IMG}/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=1100&q=80` },
  { title: 'Relaxing Facial', category: 'Facial', image_url: `${IMG}/photo-1633681926022-84c23e8cb2d6?auto=format&fit=crop&w=1100&q=80` },
  { title: 'Our Salon', category: 'Salon', image_url: `${IMG}/photo-1560869713-7d0a29430803?auto=format&fit=crop&w=1100&q=80` },
  { title: 'Braided Styling', category: 'Hairstyle', image_url: `${IMG}/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=1100&q=80` }
];

const sampleReviews = [
  { name: 'Sample review — Priya S.', rating: 5, body: 'Sample text. Replace with a real review. Gentle threading and a very hygienic space; the staff explained every step before starting.' },
  { name: 'Sample review — Anjali M.', rating: 5, body: 'Sample text. Replace with a real review. My facial was relaxing and my skin felt great. Booking through the site was simple.' },
  { name: 'Sample review — Neha R.', rating: 4, body: 'Sample text. Replace with a real review. Loved the hairstyle for my engagement. Showed me photos of similar looks first.' }
];

module.exports = { defaultSettings, services, faqs, gallery, sampleReviews };