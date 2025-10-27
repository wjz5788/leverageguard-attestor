import React from 'react';

interface ProfilePageProps {
  t: (key: string) => string;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ t }) => {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold">个人中心 (Profile)</h1>
      <p>这里是您的个人中心页面。</p>
    </div>
  );
};
