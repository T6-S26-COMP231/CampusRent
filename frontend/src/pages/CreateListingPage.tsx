import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImagePlus, PackagePlus } from 'lucide-react';
import { api } from '../api/client';
import { validateListingImages } from '../utils/imageValidation';

export default function CreateListingPage() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<string[]>([]);
  const [form, setForm] = useState({
    title: '',
    category: '',
    description: '',
    rental_terms: '',
    availability: 'available',
  });
  const [images, setImages] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<string[]>('/listings/categories').then(setCategories).catch(() => {});
  }, []);

  const selectImages = (files: FileList | null) => {
    const selected = files ? Array.from(files) : [];
    const validationError = validateListingImages(selected);
    if (validationError) {
      setImages([]);
      setError(validationError);
      return;
    }
    setError('');
    setImages(selected);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const imageValidationError = validateListingImages(images);
    if (imageValidationError) {
      setError(imageValidationError);
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([key, value]) => formData.append(key, value));
      images.forEach((image) => formData.append('images', image));

      const listing = await api.upload<{ id: number }>('/listings', formData);
      navigate(`/listings/${listing.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create listing');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-campus-600">Listing management</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold text-slate-950">Create an item listing</h1>
        <p className="mt-2 text-slate-500">Add clear information so verified students can understand what is available.</p>
      </div>

      <form onSubmit={handleSubmit} className="card mt-7 space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Title *</label>
            <input className="input-field" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Category *</label>
            <select className="input-field" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} required>
              <option value="">Select category</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Availability *</label>
            <select className="input-field" value={form.availability} onChange={(event) => setForm({ ...form, availability: event.target.value })}>
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Description *</label>
            <textarea className="input-field min-h-[120px]" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Rental terms</label>
            <textarea className="input-field min-h-[90px]" value={form.rental_terms} onChange={(event) => setForm({ ...form, rental_terms: event.target.value })} placeholder="Pickup details, duration limits, and handling instructions." />
          </div>
        </div>

        <div className="rounded-2xl border border-dashed border-campus-200 bg-campus-50/60 p-5">
          <div className="flex items-start gap-3">
            <ImagePlus className="mt-0.5 h-5 w-5 text-campus-600" />
            <div className="w-full">
              <label className="block text-sm font-semibold text-slate-800">Listing images</label>
              <p className="mt-1 text-xs text-slate-500">Maximum 5 images, 5 MB each. Accepted formats: JPG, PNG, and WEBP.</p>
              <input type="file" accept=".jpg,.jpeg,.png,.webp" multiple className="mt-3 block w-full text-sm text-slate-600" onChange={(event) => selectImages(event.target.files)} />
              {images.length > 0 && <p className="mt-2 text-xs font-semibold text-campus-700">{images.length} image{images.length === 1 ? '' : 's'} selected</p>}
            </div>
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        <button type="submit" className="btn-primary w-full" disabled={loading}>
          <PackagePlus className="h-4 w-4" /> {loading ? 'Creating...' : 'Create Listing'}
        </button>
      </form>
    </div>
  );
}
