import { useState } from "react";
import axios from "axios";
import { Upload, FileText, Check, AlertCircle, Loader2, X, Save, Plus, Trash2 } from "lucide-react";

export default function PhysicalInvoiceUpload({ onSuccess, templates = [], selectedTemplateId = "", onTemplateChange }) {
    const [file, setFile] = useState(null);
    const [extracting, setExtracting] = useState(false);
    const [extractedData, setExtractedData] = useState(null);
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const API = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            setFile(selectedFile);
            setExtractedData(null);
            setError(null);
        }
    };

    const handleExtract = async () => {
        if (!file) return;

        setExtracting(true);
        setError(null);
        const fd = new FormData();
        fd.append("file", file);

        try {
            const res = await axios.post(`${API}/invoice/extract-ocr`, fd, {
                headers: { "Content-Type": "multipart/form-data" }
            });
            setExtractedData(res.data.extracted_data);
        } catch (err) {
            console.error(err);
            setError("Failed to extract data from image/PDF. Please try again or enter manually.");
        } finally {
            setExtracting(false);
        }
    };

    const handleFieldChange = (field, value) => {
        setExtractedData(prev => ({ ...prev, [field]: value }));
    };

    const handleItemChange = (index, field, value) => {
        const newItems = [...extractedData.items];
        newItems[index] = { ...newItems[index], [field]: value };
        setExtractedData(prev => ({ ...prev, items: newItems }));
    };

    const addItem = () => {
        setExtractedData(prev => ({
            ...prev,
            items: [...prev.items, { shipmentGid: "", amount: "0.00", costTypeGid: "BASE" }]
        }));
    };

    const removeItem = (index) => {
        const newItems = extractedData.items.filter((_, i) => i !== index);
        setExtractedData(prev => ({ ...prev, items: newItems }));
    };

    const handleConfirm = async () => {
        setSubmitting(true);
        try {
            // Explicitly carry over the server-side document reference fields
            // so the backend can attach the file to the OTM invoice
            const payload = {
                ...extractedData,
                templateId: selectedTemplateId,
                // Preserve the hidden server-side file reference
                _document_path: extractedData._document_path,
                _document_filename: extractedData._document_filename,
                _document_mimetype: extractedData._document_mimetype,
            };
            const res = await axios.post(`${API}/invoice/confirm-physical`, payload);
            onSuccess?.(res.data);
            setExtractedData(null);
            setFile(null);
        } catch (err) {
            setError(err.response?.data?.error || "Failed to submit invoice");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* TEMPLATE SELECTION */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h3 className="font-bold text-slate-800">Invoice Template</h3>
                        <p className="text-xs text-slate-500">Select a template to apply mapping and default values.</p>
                    </div>
                    <select
                        value={selectedTemplateId}
                        onChange={(e) => onTemplateChange?.(e.target.value)}
                        className="w-full md:w-64 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-semibold"
                    >
                        <option value="">Default Mapping (Manual)</option>
                        {templates.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {!extractedData ? (
                <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-10 flex flex-col items-center justify-center space-y-4">
                    <div className="bg-indigo-100 p-4 rounded-full text-indigo-600">
                        <Upload size={32} />
                    </div>
                    <div className="text-center">
                        <h3 className="font-bold text-slate-800">Upload Physical Invoice</h3>
                        <p className="text-sm text-slate-500 max-w-xs mx-auto mt-1">
                            Upload a PDF or Image of your invoice. We'll use OCR to extract details automatically.
                        </p>
                    </div>

                    <input
                        type="file"
                        id="physical-upload"
                        className="hidden"
                        accept="image/*,.pdf"
                        onChange={handleFileChange}
                    />

                    <div className="flex flex-col items-center gap-3 w-full max-w-xs">
                        <label
                            htmlFor="physical-upload"
                            className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors font-semibold text-sm text-center cursor-pointer shadow-sm"
                        >
                            {file ? "Change File" : "Select PDF or Image"}
                        </label>

                        {file && (
                            <div className="flex items-center gap-2 text-xs text-indigo-600 font-bold bg-indigo-50 px-3 py-1.5 rounded-full">
                                <FileText size={14} />
                                {file.name}
                            </div>
                        )}

                        <button
                            onClick={handleExtract}
                            disabled={!file || extracting}
                            className="w-full bg-slate-900 text-white px-4 py-2.5 rounded-lg font-bold hover:bg-slate-800 transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {extracting ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                            {extracting ? "Extracting..." : "Start OCR Extraction"}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <FileText className="text-indigo-400" />
                            <div>
                                <h3 className="font-bold">Review Extracted Data</h3>
                                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">Verification Required</p>
                            </div>
                        </div>
                        <button onClick={() => setExtractedData(null)} className="text-slate-400 hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="p-6 space-y-8">
                        {/* MAIN FIELDS */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Invoice Number</label>
                                <input
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold focus:ring-2 ring-indigo-500 outline-none"
                                    value={extractedData.invoiceNumber}
                                    onChange={(e) => handleFieldChange("invoiceNumber", e.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Invoice Date</label>
                                <input
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold focus:ring-2 ring-indigo-500 outline-none"
                                    value={extractedData.invoiceDate}
                                    onChange={(e) => handleFieldChange("invoiceDate", e.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Vendor / Service Provider</label>
                                <input
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold focus:ring-2 ring-indigo-500 outline-none"
                                    value={extractedData.serviceProvider}
                                    onChange={(e) => handleFieldChange("serviceProvider", e.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Currency</label>
                                <select
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold focus:ring-2 ring-indigo-500 outline-none"
                                    value={extractedData.currencyGid}
                                    onChange={(e) => handleFieldChange("currencyGid", e.target.value)}
                                >
                                    <option value="USD">USD - US Dollar</option>
                                    <option value="INR">INR - Indian Rupee</option>
                                    <option value="EUR">EUR - Euro</option>
                                    <option value="GBP">GBP - British Pound</option>
                                </select>
                            </div>
                        </div>

                        {/* LINE ITEMS */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                    Line Items
                                    <span className="bg-slate-100 text-[10px] px-2 py-0.5 rounded-full text-slate-500">{extractedData.items?.length || 0}</span>
                                </h4>
                                <button
                                    onClick={addItem}
                                    className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 flex items-center gap-1 uppercase tracking-widest"
                                >
                                    <Plus size={14} /> Add Line
                                </button>
                            </div>

                            <div className="space-y-3">
                                {extractedData.items?.map((item, idx) => (
                                    <div key={idx} className="flex flex-wrap md:flex-nowrap items-end gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100 group">
                                        <div className="flex-1 space-y-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase">Shipment GID</label>
                                            <input
                                                className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-xs font-medium"
                                                value={item.shipmentGid || ""}
                                                onChange={(e) => handleItemChange(idx, "shipmentGid", e.target.value)}
                                            />
                                        </div>
                                        <div className="w-32 space-y-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase">Amount</label>
                                            <input
                                                className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-xs font-medium"
                                                value={item.amount || ""}
                                                onChange={(e) => handleItemChange(idx, "amount", e.target.value)}
                                            />
                                        </div>
                                        <div className="w-40 space-y-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase">Charge Type</label>
                                            <input
                                                className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-xs font-medium"
                                                value={item.costTypeGid || ""}
                                                onChange={(e) => handleItemChange(idx, "costTypeGid", e.target.value)}
                                            />
                                        </div>
                                        <button
                                            onClick={() => removeItem(idx)}
                                            className="p-2 text-slate-300 hover:text-rose-500 transition-colors mb-0.5"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* ADDITIONAL METADATA (LLM EXTRACTIONS) */}
                        {extractedData.additionalMetadata && Object.keys(extractedData.additionalMetadata).length > 0 && (
                            <div className="space-y-4 pt-4 border-t border-slate-100">
                                <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                    Additional Extracted Information
                                    <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">LLM Found</span>
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {Object.entries(extractedData.additionalMetadata).map(([key, value], idx) => (
                                        <div key={idx} className="space-y-1">
                                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{key}</label>
                                            <input
                                                className="w-full bg-indigo-50/50 border border-indigo-100 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-300"
                                                value={typeof value === 'object' ? JSON.stringify(value) : value}
                                                onChange={(e) => {
                                                    setExtractedData(prev => ({
                                                        ...prev,
                                                        additionalMetadata: {
                                                            ...prev.additionalMetadata,
                                                            [key]: e.target.value
                                                        }
                                                    }));
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="pt-6 border-t border-slate-100 flex justify-between items-center">
                            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-2 rounded-lg text-xs font-medium border border-amber-100">
                                <AlertCircle size={16} />
                                Please verify all fields before posting to OTM.
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setExtractedData(null)}
                                    className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors font-bold text-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirm}
                                    disabled={submitting}
                                    className="px-8 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-bold text-sm flex items-center gap-2 shadow-lg active:scale-95"
                                >
                                    {submitting ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                    {submitting ? "Processing OTM..." : "Create OTM Invoice"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg flex items-center gap-3 animate-in shake duration-500">
                    <AlertCircle size={18} />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            )}
        </div>
    );
}
