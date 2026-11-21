import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../app/SessionContext';
// Traduce los rótulos, categorías y filtros de Comunidad. Las publicaciones conservan su contenido original.

import { message } from '../i18n/catalog';
import { biodiversityLabels, communityLabel } from '../i18n/labels';
import { useTranslation } from '../i18n/LanguageContext';
import {
  ChevronRight,
  Leaf,
  MapPin,
  Plus,
  ShieldCheck,
  Star,
  Store,
  TriangleAlert,
} from 'lucide-react';
import { useApp } from '../app/AppContext';
import { PublishListingSheet } from '../components/PublishListingSheet';
import { SubHeader } from '../components/SubHeader';
import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_LISTINGS,
  ENVIRONMENT_TOPICS,
  SUPPORT_CENTERS,
  type CommunityListing,
} from '../lib/community';
import { loadUserListings, mergeListings, saveUserListings } from '../lib/social';
import { syncListings } from '../lib/social-sync';
import type { CommunityVoiceController } from '../lib/voice-tools';
import type { ListingFormController } from '../lib/voice-tools';
import type { BiodiversityCategory } from '../lib/types';

type View = 'home' | 'all' | 'detail';

function ListingPhoto({ listing, large = false }: { listing: CommunityListing; large?: boolean }) {
  const { t } = useTranslation();
  const Icon = COMMUNITY_CATEGORIES.find((item) => item.id === listing.category)?.icon ?? Store;
  return listing.photo ? (
    <img
      className={`listing-photo ${large ? 'is-large' : ''}`}
      src={listing.photo}
      alt={t('community.fotoDe', { title: listing.title })}
    />
  ) : (
    <span
      className={`listing-photo listing-photo-placeholder ${large ? 'is-large' : ''}`}
      aria-label={t('community.imagenDeDemostracionPara', { title: listing.title })}
    >
      <Icon size={large ? 42 : 27} aria-hidden="true" />
      {large ? <small>{t(communityLabel(listing.category))}</small> : null}
    </span>
  );
}

function ListingCard({
  listing,
  onOpen,
}: {
  listing: CommunityListing;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="community-card community-card-button"
      data-testid={`listing-${listing.id}`}
      onClick={onOpen}
    >
      <ListingPhoto listing={listing} />
      <span className="community-card-content">
        <span className="community-card-top">
          <span className="community-card-tag">{t(communityLabel(listing.category))}</span>
          <span className="community-rating">
            <Star size={13} aria-hidden="true" /> {listing.rating.toFixed(1)}
          </span>
        </span>
        <strong className="community-card-title">{listing.title}</strong>
        <span className="community-card-description">{listing.description}</span>
        <span className="community-card-foot">
          <span><MapPin size={14} aria-hidden="true" /> {listing.location}</span>
          <span className="text-btn">{t('community.verMas')}{' '}<ChevronRight size={14} aria-hidden="true" /></span>
        </span>
      </span>
    </button>
  );
}

function ListingDetail({ listing, onBack }: { listing: CommunityListing; onBack: () => void }) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
  const [reviewPosted, setReviewPosted] = useState(false);
  const [contactNotice, setContactNotice] = useState(false);

  return (
    <div className="screen listing-detail-screen">
      <SubHeader title={t('community.detalleDelServicio')} onBack={onBack} />
      <div className="listing-detail-body">
        <ListingPhoto listing={listing} large />
        <div className="listing-detail-title-row">
          <div>
            <p className="community-card-tag">{t(communityLabel(listing.category))}</p>
            <h1>{listing.title}</h1>
          </div>
          <span className="listing-detail-rating"><Star size={14} /> {listing.rating.toFixed(1)}</span>
        </div>
        <p className="listing-author">{t('community.por')}{' '}{listing.author}</p>
        <p className="listing-detail-description">{listing.description}</p>

        <div className="listing-info-grid">
          <div><span>{t('community.rangoDePrecio')}</span><strong>{listing.priceRange}</strong></div>
          <div><span>{t('common.location')}</span><strong>{listing.location}</strong></div>
        </div>

        <section className="listing-approx">
          <h2>{t('community.ubicacionAproximada')}</h2>
          <div>
            <MapPin size={19} aria-hidden="true" />
            <span>{listing.community} · {listing.district}, {listing.province}</span>
          </div>
          <small>{t('community.elMapaNoMuestraUnaUbicacion')}</small>
        </section>

        <button
          type="button"
          className="btn btn-primary btn-block btn-lg"
          onClick={() => setContactNotice(true)}
        >
          {t('community.contactar')}
        </button>
        {contactNotice ? (
          <p className="field-help">{t('community.losContactosNoEstanHabilitadosEn')}</p>
        ) : null}

        <section className="listing-reviews">
          <div className="section-head">
            <h2>{t('community.resenas')}</h2>
            <strong>{listing.rating.toFixed(1)}{' '}{t('community.de5')}</strong>
          </div>
          <div className="review-compose">
            <strong>{t('community.tuCalificacion')}</strong>
            <div className="review-stars" role="group" aria-label={t('community.eligeUnaCalificacion')}>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-label={t('community.estrellas', { value })}
                  aria-pressed={rating === value}
                  onClick={() => setRating(value)}
                >
                  <Star size={23} fill={rating >= value ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
            <textarea
              value={review}
              onChange={(event) => setReview(event.target.value)}
              placeholder={t('community.escribeTuComentario')}
              rows={3}
              maxLength={400}
            />
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={!rating || !review.trim()}
              onClick={() => {
                setReviewPosted(true);
                setReview('');
                setRating(0);
              }}
            >
              {t('community.publicarComentario')}
            </button>
            {reviewPosted ? (
              <p className="field-help">{t('community.graciasLaResenaSoloSeMuestra')}</p>
            ) : null}
          </div>
          {listing.reviews.map((item) => (
            <article className="listing-review" key={`${item.name}-${item.date}`}>
              <span className="review-avatar">{item.name.slice(0, 1)}</span>
              <div>
                <strong>{item.name}</strong>
                <span className="community-rating">{'★'.repeat(item.rating)}</span>
                <small>{item.date}</small>
                <p>{item.comment}</p>
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}

export function CommunityScreen({
  onReportBiodiversity,
  onOpenVoice,
  onVoiceControllerReady,
}: {
  onReportBiodiversity: (category: BiodiversityCategory) => void;
  onOpenVoice: () => void;
  onVoiceControllerReady: (controller: CommunityVoiceController | null) => void;
}) {
  const { t } = useTranslation();
  const { showToast } = useApp();
  const [category, setCategory] = useState<string>('todos');
  const [view, setView] = useState<View>('home');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [department, setDepartment] = useState('');
  const [province, setProvince] = useState('');
  const [district, setDistrict] = useState('');
  const [community, setCommunity] = useState('');
  const [userListings, setUserListings] = useState<CommunityListing[]>(() => loadUserListings());
  const [publishOpen, setPublishOpen] = useState(false);
  const { session } = useSession();
  const publishFormRef = useRef<ListingFormController>(null);
  const listingsRef = useRef(userListings);
  listingsRef.current = userListings;
  const pendingListings = userListings.some((item) => item.synced === false);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!navigator.onLine) return;
      const { server } = await syncListings(session.phone, listingsRef.current);
      if (!alive || !server) return;
      setUserListings((previous) => {
        const next = mergeListings(previous, server);
        saveUserListings(next);
        return next;
      });
    };
    void run();
    const timer = window.setInterval(() => void run(), 30_000);
    window.addEventListener('online', run);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('online', run);
    };
  }, [session.phone, pendingListings]);
  const allListings = useMemo(
    () => [...userListings, ...COMMUNITY_LISTINGS],
    [userListings],
  );

  const provinces = useMemo(
    () => [...new Set(allListings.filter((item) => !department || item.department === department).map((item) => item.province))],
    [allListings, department],
  );
  const districts = useMemo(
    () => [...new Set(allListings.filter((item) => (!department || item.department === department) && (!province || item.province === province)).map((item) => item.district))],
    [allListings, department, province],
  );
  const communities = useMemo(
    () => [...new Set(allListings.filter((item) => (!department || item.department === department) && (!province || item.province === province) && (!district || item.district === district)).map((item) => item.community))],
    [allListings, department, province, district],
  );
  const listings = useMemo(
    () =>
      allListings.filter(
        (item) =>
          (category === 'todos' || item.category === category) &&
          (view !== 'all' || !department || item.department === department) &&
          (view !== 'all' || !province || item.province === province) &&
          (view !== 'all' || !district || item.district === district) &&
          (view !== 'all' || !community || item.community === community),
      ),
    [allListings, category, community, department, district, province, view],
  );
  const selectedListing = allListings.find((item) => item.id === selectedId);

  useEffect(() => {
    const controller: CommunityVoiceController = {
      showHome: () => {
        setSelectedId(null);
        setView('home');
      },
      openListingForm: () => {
        setSelectedId(null);
        setView('home');
        setCategory('todos');
        publishFormRef.current?.resetForVoice();
        setPublishOpen(true);
      },
      getListingForm: () => publishFormRef.current,
    };
    onVoiceControllerReady(controller);
    return () => onVoiceControllerReady(null);
  }, [onVoiceControllerReady]);

  if (view === 'detail' && selectedListing) {
    return (
      <div data-testid="community-screen">
        <ListingDetail listing={selectedListing} onBack={() => setView('all')} />
      </div>
    );
  }

  const openDetail = (id: string) => {
    setSelectedId(id);
    setView('detail');
  };

  return (
    <div className="screen community" data-testid="community-screen">
      {view === 'all' ? (
        <SubHeader title={t('community.todasLasPublicaciones')} onBack={() => setView('home')} />
      ) : (
        <header className="screen-head">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-dot" />{' '}{t('community.compraYOfreceCercaDeTi')}
            </p>
            <h1>{t('community.conectaAmazonia')}</h1>
            <p className="screen-lead">
              {t('community.serviciosProductosYCentrosDeApoyo')}
            </p>
          </div>
        </header>
      )}

      {view === 'home' ? (
        <>
          <section className="card community-publish">
            <div className="community-publish-copy">
              <span className="community-publish-icon"><Store size={22} aria-hidden="true" /></span>
              <div>
                <strong>{t('community.publicaMiServicio')}</strong>
                <p>{t('community.hazVisibleTuEmprendimientoCuandoVuelva')}</p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              data-testid="listing-open-publish"
              onClick={() => setPublishOpen(true)}
            >
              <Plus size={17} aria-hidden="true" />{' '}{t('community.publicar')}
            </button>
          </section>

          <div className="community-chips" role="tablist" aria-label={t('community.categoriasDeLaComunidad')}>
            <button
              type="button"
              role="tab"
              aria-selected={category === 'todos'}
              className={`community-chip ${category === 'todos' ? 'is-active' : ''}`}
              onClick={() => setCategory('todos')}
            >
              {t('community.todos')}
            </button>
            {COMMUNITY_CATEGORIES.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={category === item.id}
                  className={`community-chip ${category === item.id ? 'is-active' : ''}`}
                  onClick={() => setCategory(item.id)}
                >
                  <Icon size={14} aria-hidden="true" /> {t(communityLabel(item.id))}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <section className="listing-filters" aria-label={t('community.filtrarPublicacionesPorUbicacion')}>
          <label>
            {t('community.departamento')}
            <select
              value={department}
              onChange={(event) => {
                setDepartment(event.target.value);
                setProvince('');
                setDistrict('');
                setCommunity('');
              }}
            >
              <option value="">{t('community.todos')}</option>
              {[...new Set(allListings.map((item) => item.department))].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            {t('community.provincia')}
            <select
              value={province}
              onChange={(event) => {
                setProvince(event.target.value);
                setDistrict('');
                setCommunity('');
              }}
            >
              <option value="">{t('community.todas')}</option>
              {provinces.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label>
            {t('community.distrito')}
            <select
              value={district}
              onChange={(event) => {
                setDistrict(event.target.value);
                setCommunity('');
              }}
            >
              <option value="">{t('community.todos')}</option>
              {districts.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label>
            {t('common.community')}
            <select value={community} onChange={(event) => setCommunity(event.target.value)}>
              <option value="">{t('community.todas')}</option>
              {communities.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </section>
      )}

      <section className="community-section" aria-labelledby="community-listings">
        <div className="section-head">
          <h2 id="community-listings">{view === 'all' ? t('community.publicaciones') : t('community.recomendadoCercaDeTi')}</h2>
          {view === 'home' ? (
            <button type="button" className="text-btn" onClick={() => setView('all')}>
              {t('community.verTodo')}{' '}<ChevronRight size={14} aria-hidden="true" />
            </button>
          ) : (
            <span className="demo-badge">{t('community.datosDeDemo')}</span>
          )}
        </div>
        {listings.length > 0 ? (
          <div className="community-list">
            {listings.map((item) => (
              <ListingCard key={item.id} listing={item} onOpen={() => openDetail(item.id)} />
            ))}
          </div>
        ) : (
          <div className="community-empty">
            <Store size={22} aria-hidden="true" />
            <p>{t('community.noHayPublicacionesParaEsosFiltros')}</p>
          </div>
        )}
        {view === 'home' ? (
          <button
            type="button"
            className="btn btn-secondary btn-block listing-view-all"
            data-testid="listings-view-all"
            onClick={() => setView('all')}
          >
            {t('community.verTodasLasPublicaciones')}
          </button>
        ) : null}
      </section>

      {view === 'home' ? (
        <>
          <section className="community-section" aria-labelledby="community-centers">
            <div className="section-head">
              <h2 id="community-centers">{t('community.centrosDeApoyoProximos')}</h2>
              <span className="demo-badge">{t('community.distanciasDeDemo')}</span>
            </div>
            <p className="community-section-lead">
              {t('community.puntosDeAuxilioParaLlamarO')}
            </p>
            <div className="center-list">
              {SUPPORT_CENTERS.map((center) => (
                <div key={center.id} className="center-row">
                  <span className="center-icon"><MapPin size={19} aria-hidden="true" /></span>
                  <span className="center-copy">
                    <strong>{center.name}</strong>
                    <span>{center.distance} · {t('community.supportNote')}</span>
                  </span>
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => showToast(t('community.datoDeDemostracion', { name: center.name, distance: center.distance }), 'ok')}
                  >
                    {t('common.view')}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="community-section environment" aria-labelledby="community-environment">
            <div className="environment-head">
              <span className="environment-icon"><Leaf size={21} aria-hidden="true" /></span>
              <div>
                <h2 id="community-environment">{t('community.alertaAmazonia')}</h2>
                <p>{t('community.protegerLaAmazoniaEsProtegerLa')}</p>
              </div>
            </div>
            <div className="environment-topics">
              {ENVIRONMENT_TOPICS.map((topic) => (
                <button
                  type="button"
                  key={topic}
                  data-testid={`environment-topic-${topic.toLocaleLowerCase('es').replace(/\s+/g, '-')}`}
                  onClick={() => onReportBiodiversity(topic)}
                >
                  {t(biodiversityLabels[topic])}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => onReportBiodiversity('Otro')}
            >
              <TriangleAlert size={17} aria-hidden="true" />{' '}{t('community.reportarUnaAlerta')}
            </button>
            <p className="environment-note">
              <ShieldCheck size={14} aria-hidden="true" />{' '}{t('community.elReporteSeGuardaPorSeparado')}
            </p>
          </section>
          <p className="disclaimer">
            {t('community.contenidoDeDemostracionTomadoDelPrototipo')}
          </p>
        </>
      ) : null}
      <PublishListingSheet
        ref={publishFormRef}
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onOpenVoice={onOpenVoice}
        onPublish={(listing) => {
          const next = [listing, ...userListings];
          if (!saveUserListings(next)) {
            showToast('No se pudo guardar la publicación en este teléfono.', 'error');
            return false;
          }
          setUserListings(next);
          setPublishOpen(false);
          setCategory('todos');
          showToast(message('listing.publicadoSeEnviaAlMercadoCompartido'), 'ok');
          return true;
        }}
      />
    </div>
  );
}
