import { QRCodeSVG } from 'qrcode.react';
import { MapPin } from 'lucide-react';

import {
  formatFieldLocation,
  formatFieldPrice,
  type FlyerField,
  type FlyerOrientation,
} from '../lib/fieldAdvertCopy';
import './FieldAdvertFlyer.css';

type FieldAdvertFlyerProps = {
  field: FlyerField;
  imageUrl: string | null;
  bookingUrl: string;
  orientation?: FlyerOrientation;
  logoSrc?: string;
};

/** Clean field booking flyer — QR-first, one 3D phone, portrait or landscape. */
export function FieldAdvertFlyer({
  field,
  imageUrl,
  bookingUrl,
  orientation = 'portrait',
  logoSrc = '/icon.png',
}: FieldAdvertFlyerProps) {
  const location = formatFieldLocation(field);
  const price = formatFieldPrice(field);

  return (
    <article className={`booking-flyer booking-flyer--${orientation}`}>
      <header className="booking-flyer-brand">
        <img src={logoSrc} alt="7a-side" className="booking-flyer-logo" />
        <div>
          <div className="booking-flyer-wordmark">
            <span>7a</span>-side
          </div>
          <div className="booking-flyer-tag">Booking available here</div>
        </div>
      </header>

      <div className="booking-flyer-main">
        <div className="booking-flyer-phone-wrap">
          <div className="booking-phone" aria-hidden="true">
            <div className="booking-phone-shadow" />
            <div className="booking-phone-thickness" />
            <div className="booking-phone-btn booking-phone-btn--silent" />
            <div className="booking-phone-btn booking-phone-btn--vol-up" />
            <div className="booking-phone-btn booking-phone-btn--vol-down" />
            <div className="booking-phone-btn booking-phone-btn--power" />
            <div className="booking-phone-shell">
              <div className="booking-phone-bezel">
                <div className="booking-phone-display">
                  <div className="booking-phone-status">
                    <span className="booking-phone-time">9:41</span>
                    <span className="booking-phone-status-icons">
                      <svg viewBox="0 0 17 12" aria-hidden="true">
                        <rect x="0" y="7.5" width="3" height="4.5" rx="0.6" fill="currentColor" />
                        <rect x="4.5" y="5" width="3" height="7" rx="0.6" fill="currentColor" />
                        <rect x="9" y="2.5" width="3" height="9.5" rx="0.6" fill="currentColor" />
                        <rect x="13.5" y="0" width="3" height="12" rx="0.6" fill="currentColor" />
                      </svg>
                      <svg viewBox="0 0 16 12" aria-hidden="true">
                        <path
                          d="M8 9.2a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8Zm3.4-2.1a5.1 5.1 0 0 0-6.8 0l1.1 1.1a3.5 3.5 0 0 1 4.6 0l1.1-1.1Zm2.5-2.5a8.6 8.6 0 0 0-11.8 0l1.1 1.1a7 7 0 0 1 9.6 0l1.1-1.1Z"
                          fill="currentColor"
                        />
                      </svg>
                      <span className="booking-phone-battery">
                        <span className="booking-phone-battery-level" />
                      </span>
                    </span>
                  </div>

                  <div className="booking-phone-island">
                    <span className="booking-phone-speaker" />
                    <span className="booking-phone-cam" />
                  </div>

                  <div className="booking-phone-screen">
                    <div className="booking-phone-hero">
                      {imageUrl ? (
                        <img src={imageUrl} alt="" />
                      ) : (
                        <div className="booking-phone-hero-empty" />
                      )}
                      <div className="booking-phone-hero-fade" />
                      <div className="booking-phone-appchip">
                        <img src={logoSrc} alt="" />
                        <span>7a-side</span>
                      </div>
                    </div>

                    <div className="booking-phone-panel">
                      <div className="booking-phone-chip">Available today</div>
                      <div className="booking-phone-name">{field.name}</div>
                      <div className="booking-phone-loc">
                        <MapPin size={11} strokeWidth={2.4} />
                        <span>{location}</span>
                      </div>
                      <div className="booking-phone-meta">
                        {price ? <span className="booking-phone-price">{price}</span> : null}
                        <span className="booking-phone-slot">60 min</span>
                      </div>
                      <div className="booking-phone-cta">Book now</div>
                    </div>

                    <div className="booking-phone-home" />
                  </div>

                  <div className="booking-phone-glass" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="booking-flyer-side">
          <h1 className="booking-flyer-title">{field.name}</h1>
          <p className="booking-flyer-location">
            <MapPin size={16} />
            <span>{location}</span>
          </p>
          {price ? <p className="booking-flyer-price">{price}</p> : null}

          <div className="booking-flyer-qr-block">
            <div className="booking-flyer-qr">
              <QRCodeSVG
                value={bookingUrl}
                size={orientation === 'landscape' ? 168 : 188}
                level="H"
                includeMargin={false}
                imageSettings={{
                  src: logoSrc,
                  height: 36,
                  width: 36,
                  excavate: true,
                }}
              />
            </div>
            <div className="booking-flyer-scan">Scan to book now</div>
            <p className="booking-flyer-hint">Opens this pitch for quick booking</p>
          </div>
        </div>
      </div>

      <footer className="booking-flyer-footer">
        <span>7a-side.phantommetrics.gm</span>
      </footer>
    </article>
  );
}
