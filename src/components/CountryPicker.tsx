"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { COUNTRY_OPTIONS, getCountryName } from "@/lib/countries";

interface CountryPickerProps {
  value: string;
  onChange: (countryCode: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
}

export function CountryPicker({
  value,
  onChange,
  allowEmpty = false,
  emptyLabel = "Not set",
}: CountryPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [opensUp, setOpensUp] = useState(false);

  const filteredCountries = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();

    if (!needle) {
      return COUNTRY_OPTIONS;
    }

    return COUNTRY_OPTIONS.filter(
      (country) =>
        country.name.toLocaleLowerCase().includes(needle) ||
        country.code.toLocaleLowerCase().includes(needle)
    );
  }, [query]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setQuery("");
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function toggleOpen() {
    if (!open && rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect();
      const roomBelow = window.innerHeight - rect.bottom;
      const roomAbove = rect.top;

      setOpensUp(roomBelow < 310 && roomAbove > roomBelow);
    }

    setOpen((current) => !current);

    if (open) {
      setQuery("");
    }
  }

  function selectCountry(countryCode: string) {
    onChange(countryCode);
    setOpen(false);
    setQuery("");
  }

  const selectedLabel = value
    ? getCountryName(value)
    : emptyLabel;

  return (
    <div
      ref={rootRef}
      className={`country-picker${opensUp ? " opens-up" : ""}`}
    >
      <button
        type="button"
        className="country-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggleOpen}
      >
        <span className="country-picker-selected">
          <span>{selectedLabel}</span>
          {value && (
            <span className="country-picker-selected-code">
              {value}
            </span>
          )}
        </span>

        <span
          className={`country-picker-chevron${open ? " is-open" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="country-picker-menu">
          <div className="country-picker-search-wrap">
            <input
              className="country-picker-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search country or code"
              aria-label="Search countries"
              autoFocus
            />
          </div>

          <div
            className="country-picker-options"
            role="listbox"
            aria-label="Countries"
          >
            {allowEmpty && !query && (
              <button
                type="button"
                role="option"
                aria-selected={!value}
                className={`country-picker-option${
                  !value ? " is-selected" : ""
                }`}
                onClick={() => selectCountry("")}
              >
                <span>{emptyLabel}</span>
              </button>
            )}

            {filteredCountries.map((country) => (
              <button
                key={country.code}
                type="button"
                role="option"
                aria-selected={value === country.code}
                className={`country-picker-option${
                  value === country.code ? " is-selected" : ""
                }`}
                onClick={() => selectCountry(country.code)}
              >
                <span>{country.name}</span>
                <span className="country-picker-code">
                  {country.code}
                </span>
              </button>
            ))}

            {filteredCountries.length === 0 && (
              <div className="country-picker-empty">
                No countries found.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}