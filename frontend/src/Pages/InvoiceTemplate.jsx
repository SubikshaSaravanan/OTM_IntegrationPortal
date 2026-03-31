import React, { useState, useEffect, useMemo } from "react";
import { Download, RotateCcw, FileText, Loader2, Check, Layout, ChevronDown, ChevronRight, Layers, Save, X, Plus, Trash2, Search } from "lucide-react";
import * as XLSX from "xlsx";

// Helper to format field names for display (e.g., "invoiceId" -> "Invoice ID")
const formatFieldName = (fieldName) => {
    if (!fieldName) return "";

    // If it's a split field, we've already cleaned the parts
    if (fieldName.includes('#SPLIT#')) {
        let clean = fieldName.split('#SPLIT#')[0];
        return clean.replace(/([A-Z])/g, ' $1').trim();
    }

    let formatted = fieldName
        .replace(/([A-Z])/g, ' $1') // Add space before capital letters
        .trim();

    return formatted;
};

export default function InvoiceTemplate() {
    const [fields, setFields] = useState({ invoice: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedGroups, setExpandedGroups] = useState({});

    // Save Template State
    const [saveModalOpen, setSaveModalOpen] = useState(false);
    const [templateName, setTemplateName] = useState("");
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");

    // Fetch OTM Metadata on mount
    useEffect(() => {
        fetchMetadata();
    }, []);

    const fetchMetadata = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch("/api/invoice-template/otm-metadata");
            if (!response.ok) {
                throw new Error(`Failed to fetch metadata (Status: ${response.status})`);
            }
            const data = await response.json();

            let parsedFields = [];
            console.log("Raw OTM Metadata:", data);

            // Helper to extract properties from a schema object
            const extractProperties = (schema) => {
                if (!schema) return [];
                const props = schema.properties || {};
                return Object.keys(props).map(key => ({
                    id: key,
                    name: formatFieldName(key),
                    ...props[key]
                }));
            };

            // 1. Check for OpenAPI 3.0 structure (components.schemas)
            if (data.components && data.components.schemas) {
                const schemaKey = Object.keys(data.components.schemas).find(k =>
                    k.toLowerCase() === 'invoices' || k.toLowerCase() === 'invoice'
                );

                if (schemaKey) {
                    const schema = data.components.schemas[schemaKey];
                    parsedFields = extractProperties(schema);
                    // Mark as mandatory if in the 'required' array
                    if (Array.isArray(schema.required)) {
                        parsedFields = parsedFields.map(f => ({
                            ...f,
                            required: schema.required.includes(f.id) || f.required
                        }));
                    }
                } else {
                    const firstKey = Object.keys(data.components.schemas)[0];
                    if (firstKey) {
                        const schema = data.components.schemas[firstKey];
                        parsedFields = extractProperties(schema);
                        if (Array.isArray(schema.required)) {
                            parsedFields = parsedFields.map(f => ({
                                ...f,
                                required: schema.required.includes(f.id) || f.required
                            }));
                        }
                    }
                }
            }
            // 2. Check for Swagger 2.0 structure (definitions)
            else if (data.definitions) {
                const schemaKey = Object.keys(data.definitions).find(k =>
                    k.toLowerCase() === 'invoices' || k.toLowerCase() === 'invoice'
                );
                if (schemaKey) {
                    const schema = data.definitions[schemaKey];
                    parsedFields = extractProperties(schema);
                    if (Array.isArray(schema.required)) {
                        parsedFields = parsedFields.map(f => ({
                            ...f,
                            required: schema.required.includes(f.id) || f.required
                        }));
                    }
                } else {
                    const firstKey = Object.keys(data.definitions)[0];
                    if (firstKey) {
                        const schema = data.definitions[firstKey];
                        parsedFields = extractProperties(schema);
                        if (Array.isArray(schema.required)) {
                            parsedFields = parsedFields.map(f => ({
                                ...f,
                                required: schema.required.includes(f.id) || f.required
                            }));
                        }
                    }
                }
            }
            // 3. Fallback to existing logic
            else if (Array.isArray(data)) {
                parsedFields = data;
            } else if (data.items) {
                parsedFields = data.items;
            } else if (data.properties) {
                parsedFields = Object.keys(data.properties).map(key => ({
                    id: key,
                    name: formatFieldName(key),
                    ...data.properties[key]
                }));
                if (Array.isArray(data.required)) {
                    parsedFields = parsedFields.map(f => ({
                        ...f,
                        required: data.required.includes(f.id) || f.required
                    }));
                }
            } else {
                parsedFields = Object.keys(data).map(key => ({
                    id: key,
                    name: formatFieldName(key)
                }));
            }

            let discoveryCounter = 0;
            const discoveryIndices = new Map();

            // Helper to recursively find all objects with required=true
            const findRequiredFields = (node, acc = new Map()) => {
                if (!node || typeof node !== 'object') return acc;

                // Track discovery order for EVERY name encountered
                if (node.name && !discoveryIndices.has(node.name)) {
                    discoveryIndices.set(node.name, discoveryCounter++);
                }

                if (node.required === true && node.name) {
                    // Check if we already have this field (prefer existing schema definition if available)
                    if (!acc.has(node.name)) {
                        acc.set(node.name, {
                            id: node.name,
                            name: formatFieldName(node.name),
                            description: node.description || "Required Parameter",
                            type: node.type || "string",
                            required: true
                        });
                    }
                }

                Object.values(node).forEach(child => findRequiredFields(child, acc));
                return acc;
            };

            const requiredFieldsMap = findRequiredFields(data);
            const requiredParamNames = new Set(requiredFieldsMap.keys());
            console.log("Found Required Params from Metadata:", Array.from(requiredParamNames));

            // MERGE: Add any required fields that were NOT found in the main schema
            requiredFieldsMap.forEach((fieldDef, name) => {
                const exists = parsedFields.find(f => f.id === name);
                if (!exists) {
                    console.log(`Injecting Missing Required Field: ${name}`);
                    parsedFields.push(fieldDef);
                }
            });

            // Map to our UI model and SPLIT composite fields
            const initialFields = parsedFields.flatMap(field => {
                const id = field.id || field.name;
                const isMandatory = field.required === true || requiredParamNames.has(id);
                const discoveryIndex = discoveryIndices.get(id) ?? 9999;

                // Detection: Handle various OpenAPI/Swagger and OTM-specific collection patterns
                const isArray =
                    field.type === 'array' ||
                    !!field.items ||
                    (field.properties && field.properties.items && (field.properties.items.type === 'array' || field.properties.items.items));

                // Detect OTM Composite Fields (Usually separated by Gidx or idx)
                if (id.includes('Gidx') || id.includes('idx')) {
                    const separator = id.includes('Gidx') ? 'Gidx' : 'idx';
                    const parts = id.split(separator);

                    if (parts.length >= 2) {
                        return parts.map((part, idx) => {
                            // Re-add 'Gid' suffix if it was removed by 'Gidx' split, except for the last part if it doesn't need it
                            let cleanName = part;
                            if (separator === 'Gidx' && idx < parts.length - 1) {
                                cleanName += 'Gid';
                            }

                            return {
                                id: `${id}#SPLIT#${idx + 1}`,
                                name: cleanName,
                                displayText: isArray ? [formatFieldName(cleanName)] : formatFieldName(cleanName),
                                defaultValue: "",
                                type: 'string',
                                display: isMandatory,
                                mandatory: isMandatory,
                                isSourceMandatory: isMandatory,
                                discoveryIndex: discoveryIndex + (idx * 0.1)
                            };
                        });
                    }
                }

                return [{
                    id: id,
                    name: field.name || id,
                    displayText: isArray ? [formatFieldName(id)] : formatFieldName(id),
                    defaultValue: isArray ? [""] : "",
                    type: isArray ? 'array' : (field.type || 'string'),
                    display: isMandatory,
                    mandatory: isMandatory,
                    isSourceMandatory: isMandatory,
                    discoveryIndex: discoveryIndex
                }];
            });

            // SORT by Discovery Index
            initialFields.sort((a, b) => a.discoveryIndex - b.discoveryIndex);

            setFields({ invoice: initialFields });

            // Auto-expand all groups initially
            const groups = getGroupedFields(initialFields);
            const allGroups = {};
            Object.keys(groups).forEach(g => allGroups[g] = true);
            setExpandedGroups(allGroups);

        } catch (err) {
            console.error("Error fetching OTM metadata:", err);
            setError(err.message);
            setFields({ invoice: [] });
        } finally {
            setLoading(false);
        }
    };

    // Grouping Logic (Segregate fields into functional categories)
    const getGroupedFields = (fieldList) => {
        if (!fieldList || fieldList.length === 0) return {};

        const groups = {
            "Required Fields": [],
            "Reference & Identification": [],
            "Dates & Time": [],
            "Financial Information": [],
            "Line Item Details": [],
            "Additional Information": []
        };

        fieldList.forEach(field => {
            const id = field.id.toLowerCase();
            const name = (field.name || "").toLowerCase();
            const display = Array.isArray(field.displayText)
                ? field.displayText.join(" ").toLowerCase()
                : (field.displayText || "").toLowerCase();

            if (field.isSourceMandatory) {
                groups["Required Fields"].push(field);
            } else if (field.type === 'array') {
                groups["Line Item Details"].push(field);
            } else if (id.includes('date') || id.includes('time') || name.includes('date')) {
                groups["Dates & Time"].push(field);
            } else if (id.includes('amount') || id.includes('currency') || id.includes('cost') || id.includes('price') || id.includes('value') || name.includes('amount')) {
                groups["Financial Information"].push(field);
            } else if (id.includes('id') || id.includes('number') || id.includes('gid') || id.includes('xid') || id.includes('refnum') || id.includes('qualifier')) {
                groups["Reference & Identification"].push(field);
            } else {
                groups["Additional Information"].push(field);
            }
        });

        // Filter out empty groups and maintain order
        const result = {};
        Object.keys(groups).forEach(key => {
            if (groups[key].length > 0) {
                result[key] = groups[key];
            }
        });
        return result;
    };

    const filteredFields = useMemo(() => {
        if (!searchTerm.trim()) return fields.invoice;
        const term = searchTerm.toLowerCase();
        return fields.invoice.filter(f =>
            f.id.toLowerCase().includes(term) ||
            f.name.toLowerCase().includes(term) ||
            (Array.isArray(f.displayText)
                ? f.displayText.some(h => h.toLowerCase().includes(term))
                : f.displayText.toLowerCase().includes(term))
        );
    }, [fields.invoice, searchTerm]);

    const groupedFields = useMemo(() => getGroupedFields(filteredFields), [filteredFields]);

    const selectedFields = useMemo(() =>
        fields.invoice.filter(f => f.display),
        [fields.invoice]
    );

    const toggleGroup = (groupName) => {
        setExpandedGroups(prev => ({
            ...prev,
            [groupName]: !prev[groupName]
        }));
    };

    const toggleAllGroups = (expand) => {
        const newGroups = {};
        Object.keys(groupedFields).forEach(key => newGroups[key] = expand);
        setExpandedGroups(newGroups);
    };

    const handleReset = () => {
        fetchMetadata();
    };

    const handleFieldChange = (id, property, value) => {
        setFields(prev => ({
            ...prev,
            invoice: prev.invoice.map(f => (f.id === id ? { ...f, [property]: value } : f))
        }));
    };

    const addColumnMapping = (id) => {
        setFields(prev => ({
            ...prev,
            invoice: prev.invoice.map(f => {
                if (f.id === id) {
                    const currentHeaders = Array.isArray(f.displayText) ? f.displayText : [f.displayText];
                    const seedValue = currentHeaders.length > 0 ? currentHeaders[0] : "";
                    return { ...f, displayText: [...currentHeaders, seedValue] };
                }
                return f;
            })
        }));
    };

    const removeColumnMapping = (id, index) => {
        setFields(prev => ({
            ...prev,
            invoice: prev.invoice.map(f => {
                if (f.id === id && Array.isArray(f.displayText)) {
                    const newMappings = [...f.displayText];
                    newMappings.splice(index, 1);
                    return { ...f, displayText: newMappings.length > 0 ? newMappings : [""] };
                }
                return f;
            })
        }));
    };

    const updateColumnMapping = (id, index, value) => {
        setFields(prev => ({
            ...prev,
            invoice: prev.invoice.map(f => {
                if (f.id === id) {
                    if (Array.isArray(f.displayText)) {
                        const newMappings = [...f.displayText];
                        newMappings[index] = value;
                        return { ...f, displayText: newMappings };
                    } else {
                        return { ...f, displayText: value };
                    }
                }
                return f;
            })
        }));
    };

    const handleToggle = (id, key) => {
        setFields(prev => ({
            invoice: prev.invoice.map(field => {
                if (field.id === id) {

                    // RULE: OTM-Mandatory fields -> Mandatory Checkbox is LOCKED (Always True)
                    // But Display Checkbox is UNLOCKED (User can choose to include or not)

                    if (field.isSourceMandatory && key === "mandatory") {
                        // Prevent changing mandatory status if it's OTM-required
                        return field;
                    }

                    if (key === "mandatory") {
                        const newMandatory = !field.mandatory;
                        return {
                            ...field,
                            mandatory: newMandatory,
                            // If making it mandatory, auto-enable display? 
                            // User didn't specify, but usually yes. 
                            // Yet, if User unchecks Display, it should probably uncheck Mandatory too?
                            // Let's keep simple: Mandatory toggle affects Mandatory state.
                            display: newMandatory ? true : field.display,
                            disabled: newMandatory // Lock display if manual mandatory? No, user wants flexibility.
                        };
                    }

                    // If toggling display
                    if (key === "display") {
                        return { ...field, display: !field.display };
                    }

                    return { ...field, [key]: !field[key] };
                }
                return field;
            })
        }));
    };

    const addArrayItem = (id) => {
        setFields(prev => ({
            invoice: prev.invoice.map(field =>
                field.id === id ? { ...field, defaultValue: [...field.defaultValue, ""] } : field
            )
        }));
    };

    const removeArrayItem = (id, index) => {
        setFields(prev => ({
            invoice: prev.invoice.map(field =>
                field.id === id ? {
                    ...field,
                    defaultValue: field.defaultValue.filter((_, i) => i !== index)
                } : field
            )
        }));
    };

    const updateArrayValue = (id, index, value) => {
        setFields(prev => ({
            invoice: prev.invoice.map(field =>
                field.id === id ? {
                    ...field,
                    defaultValue: field.defaultValue.map((v, i) => i === index ? value : v)
                } : field
            )
        }));
    };

    const handleSaveTemplate = async () => {
        if (!templateName.trim()) {
            alert("Please enter a template name");
            return;
        }

        setSaving(true);
        try {
            const payload = {
                name: templateName,
                fields: fields.invoice.filter(f => f.display)
                    .map(f => ({
                        id: f.id,
                        name: f.name,
                        displayText: f.displayText,
                        defaultValue: f.defaultValue,
                        type: f.type,
                        display: f.display,
                        mandatory: f.mandatory
                    }))
            };

            const res = await fetch("/api/invoice-template/templates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("Failed to save");

            setSaveModalOpen(false);
            // Persistent templateName so download captures it
            setToast("Template saved successfully!");
            setTimeout(() => setToast(null), 3000);

        } catch (err) {
            console.error(err);
            alert("Error saving template");
        } finally {
            setSaving(false);
        }
    };

    const downloadTemplate = () => {
        const displayedFields = fields.invoice.filter(f => f.display);

        // 1. Prepare Headers (Handling multi-column fields)
        const headerRow = [];
        const defaultDataRow = [];

        displayedFields.forEach(f => {
            const headers = Array.isArray(f.displayText) ? f.displayText : [f.displayText];
            const defaultValue = Array.isArray(f.defaultValue)
                ? f.defaultValue.filter(v => v && v.trim() !== "").join("; ")
                : (f.defaultValue || "");

            headers.forEach((h, idx) => {
                headerRow.push(f.mandatory ? `${h} *` : h);
                // Put default value only in the first column for multi-column fields
                defaultDataRow.push(idx === 0 ? defaultValue : "");
            });
        });

        // 2. Create Sheet Data
        const sheetData = [headerRow, defaultDataRow];

        // 3. Create Workbook and Worksheet
        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Invoice Template");

        // 4. Set column widths (Auto-fit basic)
        const wscols = headerRow.map(h => ({ wch: Math.max(h.length + 5, 15) }));
        ws['!cols'] = wscols;

        // 5. Generate Filename
        const fileName = templateName.trim()
            ? templateName.trim().replace(/[^a-z0-9]/gi, '_').toUpperCase()
            : "INVOICE_TEMPLATE";

        // 6. Download
        XLSX.writeFile(wb, `${fileName}.xlsx`);
    };

    return (
        <div className="flex flex-col min-h-screen bg-slate-50 font-sans text-slate-900">

            {/* TOAST */}
            {toast && (
                <div className="fixed top-5 right-5 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                    <Check size={18} />
                    {toast}
                </div>
            )}

            {/* HEADER SECTION */}
            <div className="bg-white border-b border-slate-200 px-8 py-5 flex justify-between items-center sticky top-0 z-20 shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Layout className="text-indigo-600" />
                        Invoice Template Configuration
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Configure your invoice template fields locally.</p>
                </div>
                <div className="flex items-center gap-3">
                    {saveModalOpen ? (
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 shadow-inner">
                            <input
                                className="bg-transparent border-none focus:ring-0 outline-none text-sm w-48 placeholder:text-slate-400"
                                placeholder="Template Name..."
                                value={templateName}
                                onChange={e => setTemplateName(e.target.value)}
                                autoFocus
                            />
                            <button
                                onClick={handleSaveTemplate}
                                disabled={saving}
                                className="p-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors disabled:opacity-50"
                                title="Confirm Save"
                            >
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                            </button>
                            <button
                                onClick={() => setSaveModalOpen(false)}
                                className="p-1.5 bg-slate-200 text-slate-600 rounded hover:bg-slate-300 transition-colors"
                                title="Cancel"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setSaveModalOpen(true)}
                            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-sm font-medium text-sm flex items-center gap-2 transition-colors"
                        >
                            <Save size={16} />
                            Save Configuration
                        </button>
                    )}

                    <div className="h-6 w-px bg-slate-200 mx-1"></div>

                    <button
                        onClick={handleReset}
                        className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 hover:text-slate-900 font-medium text-sm flex items-center gap-2 transition-colors shadow-sm"
                    >
                        <RotateCcw size={16} />
                        Refresh
                    </button>
                    <button
                        onClick={downloadTemplate}
                        disabled={loading || fields.invoice.length === 0}
                        className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md flex items-center gap-2 font-medium text-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Download size={18} />
                        Download Template
                    </button>
                </div>
            </div>

            {/* CONTENT AREA */}
            <div className="flex-1 p-8 max-w-7xl mx-auto w-full">

                {loading && (
                    <div className="flex flex-col items-center justify-center p-12 text-slate-500">
                        <Loader2 className="animate-spin mb-3 text-indigo-600" size={32} />
                        <p>Fetching fields from OTM...</p>
                    </div>
                )}

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg mb-6">
                        <div className="font-semibold mb-1">Error fetching metadata</div>
                        <div className="text-sm">{error}</div>
                        <button onClick={fetchMetadata} className="mt-2 text-sm underline font-medium">Try Again</button>
                    </div>
                )}

                {!loading && !error && (
                    <div className="flex flex-col lg:flex-row gap-8 items-start">

                        {/* LEFT COLUMN: Main Configuration */}
                        <div className="flex-1 space-y-6 w-full">

                            <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <div className="relative w-full md:w-96">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input
                                        type="text"
                                        placeholder="Search fields by name or ID..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                                    />
                                    {searchTerm && (
                                        <button
                                            onClick={() => setSearchTerm("")}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                                <div className="flex items-center gap-6">
                                    <div className="text-sm text-slate-500">
                                        Showing <strong>{filteredFields.length}</strong> of <strong>{fields.invoice.length}</strong> fields in <strong>{Object.keys(groupedFields).length}</strong> groups
                                    </div>
                                    <div className="h-4 w-px bg-slate-200"></div>
                                    <div className="flex gap-2">
                                        <button onClick={() => toggleAllGroups(true)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 px-3 py-1.5 rounded-md hover:bg-indigo-50 transition-colors">Expand All</button>
                                        <button onClick={() => toggleAllGroups(false)} className="text-xs font-semibold text-slate-500 hover:text-slate-600 px-3 py-1.5 rounded-md hover:bg-slate-100 transition-colors">Collapse All</button>
                                    </div>
                                </div>
                            </div>

                            {Object.keys(groupedFields).map(groupName => (
                                <div key={groupName} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                    {/* Group Header */}
                                    <button
                                        onClick={() => toggleGroup(groupName)}
                                        className="w-full px-6 py-4 bg-slate-50/50 hover:bg-slate-50 border-b border-slate-100 flex justify-between items-center transition-colors text-left"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Layers size={18} className="text-slate-400" />
                                            <h3 className="font-semibold text-slate-800">{groupName}</h3>
                                            <span className="text-xs font-medium px-2 py-0.5 bg-slate-200 text-slate-600 rounded-full">
                                                {groupedFields[groupName].length}
                                            </span>
                                        </div>
                                        {expandedGroups[groupName] ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
                                    </button>

                                    {/* Group Content (Table) */}
                                    {expandedGroups[groupName] && (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left text-sm">
                                                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                                                    <tr>
                                                        <th className="px-6 py-3 w-1/4">Field Name</th>
                                                        <th className="px-6 py-3 w-1/4">Display Text</th>
                                                        <th className="px-6 py-3 w-1/5">Default Value</th>
                                                        <th className="px-6 py-3 text-center w-24">Display</th>
                                                        <th className="px-6 py-3 text-center w-24">Mandatory</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {groupedFields[groupName].map((field) => (
                                                        <tr key={field.id} className={`hover:bg-slate-50/80 transition-colors ${field.isSourceMandatory ? 'bg-slate-50/50' : ''}`}>
                                                            <td className="px-6 py-3">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="font-medium text-slate-700 flex items-center gap-1">
                                                                        {field.name}
                                                                        {field.isSourceMandatory && <span className="text-red-600 font-black text-lg ml-0.5" title="OTM Mandatory Field">*</span>}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-3">
                                                                {Array.isArray(field.displayText) ? (
                                                                    <div className="space-y-1.5">
                                                                        {field.displayText.map((header, idx) => (
                                                                            <div key={idx} className="flex gap-1 group/header">
                                                                                <input
                                                                                    type="text"
                                                                                    value={header}
                                                                                    onChange={(e) => updateColumnMapping(field.id, idx, e.target.value)}
                                                                                    className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-400"
                                                                                    placeholder={`Column Header ${idx + 1}`}
                                                                                />
                                                                                <button
                                                                                    onClick={() => removeColumnMapping(field.id, idx)}
                                                                                    className="text-slate-300 hover:text-rose-500 p-1 opacity-0 group-hover/header:opacity-100 transition-all"
                                                                                    title="Remove Header"
                                                                                >
                                                                                    <X size={14} />
                                                                                </button>
                                                                            </div>
                                                                        ))}
                                                                        <button
                                                                            onClick={() => addColumnMapping(field.id)}
                                                                            className="text-indigo-600 hover:text-indigo-700 text-xs font-bold flex items-center gap-1 mt-1 transition-colors"
                                                                        >
                                                                            <Plus size={12} /> Add Another Column
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <input
                                                                        type="text"
                                                                        value={field.displayText}
                                                                        onChange={(e) => handleFieldChange(field.id, "displayText", e.target.value)}
                                                                        className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-400"
                                                                        placeholder="Column Header"
                                                                    />
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-3">
                                                                {field.type === 'array' ? (
                                                                    <div className="space-y-1.5 py-1">
                                                                        {Array.isArray(field.defaultValue) && field.defaultValue.map((val, idx) => (
                                                                            <div key={idx} className="flex gap-1 group/item">
                                                                                <input
                                                                                    type="text"
                                                                                    value={val}
                                                                                    onChange={(e) => updateArrayValue(field.id, idx, e.target.value)}
                                                                                    className="flex-1 bg-white border border-slate-200 rounded-md px-2 py-1.5 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                                                                                    placeholder="Value"
                                                                                />
                                                                                {field.defaultValue.length > 1 && (
                                                                                    <button
                                                                                        onClick={() => removeArrayItem(field.id, idx)}
                                                                                        className="text-slate-300 hover:text-rose-500 p-1 transition-colors"
                                                                                        title="Remove item"
                                                                                    >
                                                                                        <X size={14} />
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                        <button
                                                                            onClick={() => addArrayItem(field.id)}
                                                                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 mt-1 transition-colors uppercase tracking-wider"
                                                                        >
                                                                            <Plus size={12} /> Add Value
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <input
                                                                        type="text"
                                                                        value={field.defaultValue}
                                                                        onChange={(e) => handleFieldChange(field.id, "defaultValue", e.target.value)}
                                                                        className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-400"
                                                                        placeholder="Value"
                                                                    />
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-3 text-center">
                                                                <div className="flex justify-center">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={field.display}
                                                                        onChange={() => handleToggle(field.id, "display")}
                                                                        className={`w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-colors cursor-pointer ${field.disabled ? 'opacity-50 cursor-not-allowed bg-slate-100' : ''}`}
                                                                    />
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-3 text-center">
                                                                <div className="flex justify-center">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={field.mandatory}
                                                                        onChange={() => handleToggle(field.id, "mandatory")}
                                                                        disabled={field.isSourceMandatory}
                                                                        className={`w-5 h-5 rounded border-slate-300 text-rose-500 focus:ring-rose-500 transition-colors cursor-pointer ${field.isSourceMandatory ? 'opacity-50 cursor-not-allowed bg-slate-100' : ''}`}
                                                                    />
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* RIGHT COLUMN: Selection Summary */}
                        <div className="w-full lg:w-80 shrink-0 sticky top-24 space-y-4">
                            <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
                                <div className="bg-slate-900 text-white px-5 py-3 flex justify-between items-center">
                                    <h3 className="font-bold text-sm tracking-wide uppercase">Selected Fields</h3>
                                    <span className="bg-emerald-500 text-[10px] px-2 py-0.5 rounded-full font-black">
                                        {selectedFields.length}
                                    </span>
                                </div>
                                <div className="p-4 max-h-[calc(100vh-250px)] overflow-y-auto custom-scrollbar text-slate-900">
                                    {selectedFields.length === 0 ? (
                                        <div className="text-center py-8">
                                            <div className="bg-slate-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                                                <Layers size={20} className="text-slate-300" />
                                            </div>
                                            <p className="text-xs text-slate-400">No fields selected yet.<br />Check "Display" to add fields.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {selectedFields.map(f => (
                                                <div key={f.id} className="group flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-lg hover:border-indigo-200 hover:bg-white transition-all shadow-sm">
                                                    <div className="overflow-hidden">
                                                        <div className="text-xs font-bold text-slate-700 truncate">
                                                            {Array.isArray(f.displayText) ? f.displayText.join(", ") : f.displayText}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleToggle(f.id, "display")}
                                                        className="p-1 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                                                        title="Remove from template"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {selectedFields.length > 0 && (
                                    <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-3">
                                        <div className="flex justify-between text-[11px] text-slate-500 font-medium">
                                            <span>Mandatory Fields</span>
                                            <span className="text-rose-600">{selectedFields.filter(f => f.mandatory).length}</span>
                                        </div>
                                        <div className="flex justify-between text-[11px] text-slate-500 font-medium">
                                            <span>Total Columns</span>
                                            <span className="text-slate-900 font-bold">{selectedFields.length}</span>
                                        </div>
                                        <button
                                            onClick={() => setSaveModalOpen(true)}
                                            className="w-full py-2.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-lg"
                                        >
                                            <Save size={14} />
                                            Save Configuration
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* TIPS SECTION */}
                            <div className="bg-indigo-50/50 rounded-xl p-4 border border-indigo-100">
                                <h4 className="text-[10px] font-black text-indigo-700 uppercase tracking-widest mb-2">Pro Tip</h4>
                                <p className="text-[11px] text-indigo-600 leading-relaxed">
                                    OTM mandatory fields (*) are automatically selected for you but you can deselect them if you want as long as you provide the data elsewhere.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
