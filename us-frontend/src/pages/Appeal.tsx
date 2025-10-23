import React, { useState, useRef } from 'react';
import { submitAppeal, type AppealPayload } from '../services/appeal';

export function AppealPage() {
  const [claimId, setClaimId] = useState('');
  const [reason, setReason] = useState('');
  const [contact, setContact] = useState('');
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success' or 'error'
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newFiles = Array.from(files).filter(file => 
        file.type.startsWith('image/') && file.size <= 5 * 1024 * 1024 // 5MB limit
      );
      setScreenshots(prev => [...prev, ...newFiles]);
    }
  };

  const removeScreenshot = (index: number) => {
    setScreenshots(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');
    
    try {
      // Convert screenshots to base64 for submission
      const screenshotData = await Promise.all(
        screenshots.map(file => {
          return new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
        })
      );

      const payload: AppealPayload = {
        claimId: claimId.trim(),
        reason: reason.trim(),
        contact: contact.trim(),
        screenshots: screenshotData,
      };
      
      const result = await submitAppeal(payload);
      
      setMessage(`申诉提交成功！申诉编号：${result.appealId}`);
      setMessageType('success');
      
      // Reset form
      setClaimId('');
      setReason('');
      setContact('');
      setScreenshots([]);
    } catch (error) {
      console.error('Error submitting appeal:', error);
      setMessage(`申诉提交失败：${error.message}`);
      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold text-white mb-6">提交申诉</h1>
      
      {message && (
        <div className={`p-4 rounded-lg mb-6 ${
          messageType === 'success' 
            ? 'bg-green-900 text-green-200' 
            : 'bg-red-900 text-red-200'
        }`}>
          {message}
        </div>
      )}
      
      <div className="bg-slate-800 rounded-lg p-6 mb-6">
        <h2 className="text-2xl font-semibold text-white mb-4">申诉信息</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              理赔编号
            </label>
            <input 
              type="text" 
              value={claimId}
              onChange={(e) => setClaimId(e.target.value)}
              placeholder="请输入您的理赔编号"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
              required
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              申诉原因
            </label>
            <textarea 
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="请详细描述您的情况，包括爆仓细节、截图说明等"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white min-h-[120px]"
              required
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              联系方式（可选）
            </label>
            <input 
              type="text" 
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="邮箱或Telegram，方便我们联系您"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
            />
          </div>
          
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              上传截图
            </label>
            <div className="space-y-4">
              <input 
                ref={fileInputRef}
                type="file" 
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors"
              >
                选择截图文件
              </button>
              
              {screenshots.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-slate-300">已选择 {screenshots.length} 个文件：</p>
                  {screenshots.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-slate-700 p-2 rounded">
                      <span className="text-sm text-white truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeScreenshot(index)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        移除
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-slate-400">支持 PNG、JPG、WEBP 格式，单个文件 ≤ 5MB</p>
            </div>
          </div>
          
          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-bold py-2 px-4 rounded transition-colors"
          >
            {isLoading ? '提交中...' : '提交申诉'}
          </button>
        </form>
      </div>
      
      <div className="bg-slate-800 rounded-lg p-6">
        <h2 className="text-2xl font-semibold text-white mb-4">申诉流程说明</h2>
        <ol className="list-decimal list-inside space-y-2 text-slate-300">
          <li>提交申诉后，我们的团队将在24小时内进行审核</li>
          <li>审核过程中可能需要您提供更多信息</li>
          <li>审核通过后，赔付将自动处理</li>
          <li>您可以通过理赔编号查询申诉状态</li>
          <li>如有疑问，请通过您提供的联系方式与我们联系</li>
        </ol>
      </div>
    </div>
  );
}