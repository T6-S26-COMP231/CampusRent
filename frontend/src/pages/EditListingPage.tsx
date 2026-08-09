import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ImagePlus, Trash2, X } from 'lucide-react';
import { api, assetUrl, Listing } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  appendListingImages,
  resolveListingImageSelection,
} from '../utils/imageValidation';

export default function EditListingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({ title: '', category: '', description: '', rental_terms: '' });
  const [listing, setListing] = useState<Listing | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [newPreviewUrls, setNewPreviewUrls] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const loadListing = () => {
    api.get<Listing>(`/listings/${id}`)
      .then((item) => {
        if (!user || item.owner?.id !== user.id) {
          navigate(`/listings/${id}`, { replace: true });
          return;
        }
        setListing(item);
        setForm({
          title: item.title,
          category: item.category,
          description: item.description,
          rental_terms: item.rental_terms,
        });
      })
      .catch(() => navigate('/my-listings', { replace: true }));
  };

  useEffect(() => {
    api.get<string[]>('/listings/categories').then(setCategories).catch(() => {});
    loadListing();
  }, [id, navigate, user]);

  useEffect(() => {
    const urls = newImages.map((file) => URL.createObjectURL(file));
    setNewPreviewUrls(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [newImages]);

  const selectImages = (fileList: FileList | null) => {
    const { files, error: selectionError } = resolveListingImageSelection(fileList, {
      existingCount: listing?.images.length || 0,
    });
    if (selectionError) {
      setNewImages([]);
      setError(selectionError);
      return;
    }
    setError('');
    setNewImages(files);
  };

  const removeNewImage = (index: number) => {
    setNewImages((current) => current.filter((_, imageIndex) => imageIndex !== index));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([key, value]) => formData.append(key, value));
      appendListingImages(formData, newImages);
      await api.uploadPut(`/listings/${id}`, formData);
      setNewImages([]);
      setMessage('Listing updated successfully.');
      loadListing();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  const removeImage = async (imageUrl: string) => {
    const imageId = imageUrl.split('/').pop();
    if (!imageId || !confirm('Remove this image from the listing?')) return;
    try {
      await api.delete(`/listings/${id}/images/${encodeURIComponent(imageId)}`);
      setMessage('Image removed successfully.');
      loadListing();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove image');
    }
  };

  const updateAvailability = async (availability: 'available' | 'unavailable') => {
    try {
      await api.patch(`/listings/${id}/availability`, { availability });
      setMessage(`Listing marked ${availability}.`);
      loadListing();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update availability');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Remove this listing permanently?')) return;
    try {
      await api.delete(`/listings/${id}`);
      navigate('/my-listings');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-campus-600">Listing management</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold text-slate-950">Edit item listing</h1>
        <p className="mt-2 text-slate-500">Update information, replace images, change availability, or remove the listing.</p>
      </div>

      {message && <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}
      {error && <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {listing && (
        <section className="card mt-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">Availability</h2>
              <p className="mt-1 text-sm text-slate-500">Unavailable listings are hidden from the available-items browse flow.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => updateAvailability('available')} className={listing.availability === 'available' ? 'btn-primary' : 'btn-secondary'}>Available</button>
              <button type="button" onClick={() => updateAvailability('unavailable')} className={listing.availability === 'unavailable' ? 'btn-primary' : 'btn-secondary'}>Unavailable</button>
            </div>
          </div>
        </section>
      )}

      <form onSubmit={handleSubmit} className="card mt-5 space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">Title *</label>
          <input className="input-field" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">Category *</label>
          <select className="input-field" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} required>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">Description *</label>
          <textarea className="input-field min-h-[120px]" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">Rental terms</label>
          <textarea className="input-field min-h-[90px]" value={form.rental_terms} onChange={(event) => setForm({ ...form, rental_terms: event.target.value })} />
        </div>

        <div>
          <div className="flex items-center gap-2">
            <ImagePlus className="h-5 w-5 text-campus-600" />
            <h2 className="font-display font-bold text-slate-900">Listing images</h2>
          </div>
          {listing?.images.length ? (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {listing.images.map((image) => (
                <div key={image.url} className="relative overflow-hidden rounded-2xl border border-slate-200">
                  <img src={assetUrl(image.url)} alt="Listing" className="aspect-square w-full object-cover" />
                  <button type="button" onClick={() => removeImage(image.url)} className="absolute right-2 top-2 rounded-full bg-white/95 p-2 text-red-600 shadow-md" aria-label="Remove image">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : <p className="mt-3 text-sm text-slate-500">No images are currently attached.</p>}
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            multiple
            className="mt-4 block w-full text-sm text-slate-600"
            onChange={(event) => {
              selectImages(event.target.files);
              event.target.value = '';
            }}
          />
          <p className="mt-2 text-xs text-slate-400">Existing and newly selected images combined cannot exceed 5. Each image must be JPG, PNG, or WEBP and 5 MB or smaller.</p>
          {newImages.length > 0 && (
            <>
              <p className="mt-3 text-xs font-semibold text-campus-700">
                {newImages.length} new image{newImages.length === 1 ? '' : 's'} selected
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {newPreviewUrls.map((url, index) => (
                  <div key={`${newImages[index]?.name ?? 'new'}-${index}`} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <img src={url} alt={newImages[index]?.name || `New image ${index + 1}`} className="aspect-square w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeNewImage(index)}
                      className="absolute right-2 top-2 rounded-full bg-white/95 p-1.5 text-slate-700 shadow-md"
                      aria-label={`Remove ${newImages[index]?.name || `new image ${index + 1}`}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="submit" className="btn-primary flex-1" disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</button>
          <button type="button" onClick={handleDelete} className="btn-danger"><Trash2 className="h-4 w-4" /> Remove Listing</button>
        </div>
      </form>
    </div>
  );
}
